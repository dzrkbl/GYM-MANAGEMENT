import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { exec } from 'child_process';

// Routers
import authRouter from './src/routes/auth';
import membersRouter from './src/routes/members';
import paymentsRouter from './src/routes/payments';
import coursesRouter from './src/routes/courses';
import attendancesRouter from './src/routes/attendances';
import dashboardRouter from './src/routes/dashboard';
import gradesRouter from './src/routes/grades';
import coachsRouter from './src/routes/coachs';
import rapportsRouter from './src/routes/rapports';
import versementsRouter from './src/routes/versements';
import sectionsRouter from './src/routes/sections';
import masseSalarialeRouter from './src/routes/masseSalariale';
import coachSalaireRouter from './src/routes/coachSalaire';
import depensesRouter from './src/routes/depenses';
import depenseConfigsRouter from './src/routes/depenseConfigs';
import importRouter from './src/routes/import';
import inscriptionRouter from './src/routes/inscription';
import auditRouter from './src/routes/audit';
import communicationsRouter from './src/routes/communications';
import leadsRouter from './src/routes/leads';
import backupRouter from './src/routes/backup';
import inventaireRouter from './src/routes/inventaire';
import evenementsRouter from './src/routes/evenements';
import affiliationsRouter from './src/routes/affiliations';
import retentionRouter from './src/routes/retention';
import calendrierRouter from './src/routes/calendrier';

import { runAllReminders } from './src/lib/reminders';
import { prisma } from './src/lib/prisma';
import { bootstrapIfEmpty } from './src/lib/seedData';
import { rateLimit } from './src/middleware/rateLimit';
import { configCourriel, sendEmailBackground, htmlCourriel } from './src/lib/mailer';

// Sans secret JWT, aucune authentification ne peut fonctionner : on refuse de
// démarrer avec un message clair plutôt que d'échouer au premier login.
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET manquant. Définissez cette variable d\'environnement avant de démarrer.');
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Derrière le proxy de Render : nécessaire pour que req.ip soit la vraie
// adresse du client (utilisée par le limiteur de débit).
app.set('trust proxy', 1);

app.use(cors());
// Limite montée à 2 Mo : les imports CSV collés (membres + versements) dépassent
// facilement la limite par défaut de 100 Ko d'Express.
app.use(express.json({ limit: '2mb' }));

// ---- Déclencheur intégré des rappels quotidiens ----
// Render (offre gratuite) dort sans trafic et aucun cron externe n'est encore
// configuré : on déclenche donc la tournée de rappels au premier accès de la
// journée (entre 8 h et 20 h, heure de Montréal). ReminderLog déduplique, donc
// plusieurs exécutions le même jour sont sans effet. Un cron externe sur
// /api/cron/reminders reste recommandé (il réveille aussi l'application).
let derniereTentativeRappels = 0;
let rappelsEnCours = false;
// La première tournée attend la fin des migrations : au déploiement d'une
// nouvelle colonne, un ping entrant déclenchait la tournée quelques secondes
// AVANT que « prisma migrate deploy » (en arrière-plan) ne l'ait créée.
let basePrete = !process.env.DATABASE_URL;
// État interne exposé par /api/health/complet (auto-surveillance).
let etatMigrations: 'EN_COURS' | 'OK' | 'ECHEC' = process.env.DATABASE_URL ? 'EN_COURS' : 'OK';
let erreurMigrations: string | null = null;
let derniereTourneeOk: Date | null = null;
function heureMontreal(): number {
  return parseInt(
    new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', hour: '2-digit', hour12: false })
      .format(new Date()),
    10
  );
}
app.use((_req, _res, next) => {
  const maintenant = Date.now();
  const h = heureMontreal();
  if (basePrete && !rappelsEnCours && maintenant - derniereTentativeRappels > 6 * 3600_000 && h >= 8 && h < 20) {
    rappelsEnCours = true;
    derniereTentativeRappels = maintenant;
    runAllReminders()
      .then((r: any) => {
        if (!r?.ignore) {
          console.log('✅ Tournée de rappels quotidienne exécutée.');
          derniereTourneeOk = new Date();
        }
      })
      .catch((e) => console.error('Erreur rappels quotidiens:', e))
      .finally(() => { rappelsEnCours = false; });
  }
  next();
});

// Anti-abus sur les deux endpoints publics sensibles.
app.post('/api/auth/login', rateLimit({
  fenetreMs: 15 * 60_000, max: 10,
  message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
}));
app.post('/api/inscription', rateLimit({
  fenetreMs: 60 * 60_000, max: 5,
  message: "Trop de demandes d'inscription. Réessayez plus tard.",
}));

// Main API Endpoints
app.use('/api/auth', authRouter);
app.use('/api/membres', membersRouter);
app.use('/api/paiements', paymentsRouter);
app.use('/api/cours', coursesRouter);
app.use('/api/presences', attendancesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/grades', gradesRouter);
app.use('/api/coachs', coachsRouter);
app.use('/api/rapports', rapportsRouter);
app.use('/api/versements', versementsRouter);
app.use('/api/sections', sectionsRouter);
app.use('/api/masse-salariale', masseSalarialeRouter);
app.use('/api/coach-salaire', coachSalaireRouter);
app.use('/api/depenses', depensesRouter);
app.use('/api/depense-configs', depenseConfigsRouter);
app.use('/api/import', importRouter);
app.use('/api/inscription', inscriptionRouter);
app.use('/api/audit', auditRouter);
app.use('/api/communications', communicationsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/inventaire', inventaireRouter);
app.use('/api/evenements', evenementsRouter);
app.use('/api/affiliations', affiliationsRouter);
app.use('/api/retention', retentionRouter);
app.use('/api/calendrier', calendrierRouter);

// Basic health check
// LÉGER exprès : pingé toutes les ~5 min par UptimeRobot pour garder Render
// éveillé. Il ne touche PAS la base (Neon doit pouvoir dormir entre deux
// vraies requêtes). La vérification profonde vit sur /api/health/complet.
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'CSHP API is running!' });
});

// Bilan de santé PROFOND : base, migrations, transport courriel, canal admin.
// Réveille Neon à chaque appel : à pinger seulement quelques fois par jour
// (workflow GitHub « surveillance », moniteur UptimeRobot espacé), jamais
// toutes les 5 minutes. Répond 503 dès qu'un maillon est cassé, pour que
// n'importe quel moniteur HTTP le voie sans parser le JSON.
app.get('/api/health/complet', async (_req, res) => {
  const bilan: Record<string, any> = { horodatage: new Date().toISOString() };
  let ok = true;

  const debut = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    bilan.base = { ok: true, latenceMs: Date.now() - debut };
  } catch (e) {
    ok = false;
    bilan.base = { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }

  bilan.migrations = { ok: etatMigrations !== 'ECHEC', etat: etatMigrations };
  if (erreurMigrations) bilan.migrations.erreur = erreurMigrations;
  if (etatMigrations === 'ECHEC') ok = false;

  const cfg = configCourriel();
  bilan.courriel = { ok: !!cfg.provider, transport: cfg.provider || 'aucun' };
  if (!cfg.provider) ok = false;

  // Sans ce canal, toutes les alertes admin (leads de secours, inscriptions,
  // retards) sont muettes : c'est un maillon de la chaîne, pas un détail.
  bilan.canalAdmin = { ok: !!process.env.INSCRIPTION_NOTIF_EMAIL };
  if (!process.env.INSCRIPTION_NOTIF_EMAIL) ok = false;

  // Redémarre à null à chaque déploiement : « null » signifie « aucune tournée
  // depuis le dernier redémarrage », pas « jamais » (le témoin fiable reste le
  // courriel de sauvegarde quotidien).
  bilan.derniereTournee = derniereTourneeOk ? derniereTourneeOk.toISOString() : null;

  res.status(ok ? 200 : 503).json({ ok, ...bilan });
});

// Cron : relances automatiques (déclenché par un service externe avec le Bearer CRON_SECRET).
// Couvre : rappels de paiement (J-7, jour J, retard), renouvellements (J-30) et absences.
app.get('/api/cron/reminders', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const resultats = await runAllReminders();
    if (!(resultats as any)?.ignore) derniereTourneeOk = new Date();
    res.json({ success: true, resultats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

import { existsSync } from 'fs';

async function startServer() {
  // Toute route /api inconnue doit répondre en JSON (404) au lieu de recevoir
  // la page HTML de l'application (le fallback SPA ci-dessous).
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint API introuvable' });
  });

  // OUVRIR LE PORT EN PREMIER. Render considère le déploiement échoué
  // (« Timed Out ») si le port ne s'ouvre pas assez vite : tout ce qui est
  // lent (migrations, montage du frontend) se fait APRÈS, jamais avant.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);

    // Run database migrations in the background so they don't block port-binding/health checks
    if (process.env.DATABASE_URL) {
      console.log('⏳ Running database migrations in the background...');
      exec('npx prisma migrate deploy', async (error, stdout, stderr) => {
        // Dans tous les cas, libérer les rappels : le schéma est soit à jour,
        // soit inchangé depuis le déploiement précédent.
        basePrete = true;
        if (error) {
          etatMigrations = 'ECHEC';
          erreurMigrations = error.message;
          console.error(`❌ Migration error: ${error.message}`);
          // Un déploiement avec migrations cassées tournait jusqu'ici en
          // silence (schéma décalé, erreurs 500 aléatoires) : on prévient
          // l'admin immédiatement par le canal habituel.
          if (process.env.INSCRIPTION_NOTIF_EMAIL) {
            sendEmailBackground({
              to: process.env.INSCRIPTION_NOTIF_EMAIL,
              subject: '🚨 CSHP Gestion : échec des migrations au déploiement',
              html: htmlCourriel(`
                <p>Le serveur a démarré mais <strong>les migrations de base de
                données ont échoué</strong>. L'application tourne avec un schéma
                possiblement décalé : certaines pages peuvent renvoyer des erreurs.</p>
                <p>Erreur : ${error.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                <p>À vérifier dans les logs Render (service cshp-backend).</p>`,
                { salutation: null }),
            }, 'Alerte migrations échouées');
          }
          return;
        }
        etatMigrations = 'OK';
        if (stderr) {
          console.warn(`⚠️ Migration stderr: ${stderr}`);
        }
        console.log(`✅ Migrations completed successfully:\n${stdout}`);

        // Amorçage automatique si la base est vide (1er déploiement, sans terminal).
        try {
          const seeded = await bootstrapIfEmpty(prisma);
          if (seeded) console.log('✅ Base vide : amorçage initial effectué (admin + sections + cours).');
        } catch (e) {
          console.error('❌ Erreur d\'amorçage initial:', e);
        }
      });
    }
  });

  // Frontend : en production (bundle dist/server.cjs, NODE_ENV=production ou
  // build présent), on sert les fichiers statiques. Vite n'est chargé (import
  // dynamique) qu'en développement (`npm run dev` via tsx) : le bundle de
  // production ne dépend plus de lui au démarrage.
  const enDev = process.env.NODE_ENV !== 'production'
    && (process.argv[1] || '').endsWith('.ts'); // `npm run dev` exécute server.ts ; le build exécute dist/server.cjs
  const distPath = path.join(process.cwd(), 'dist');
  if (!enDev && existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
}

startServer();

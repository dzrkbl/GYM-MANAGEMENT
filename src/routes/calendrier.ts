import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { parseIcal, deviner } from '../lib/ical';

const router = Router();

const TAILLE_MAX_ICS = 3_000_000; // 3 Mo : un calendrier de saison pèse quelques dizaines de Ko

/**
 * GET /api/calendrier?debut=AAAA-MM-JJ&fin=AAAA-MM-JJ
 * Les événements datés de la fenêtre demandée (calendrier de saison + club).
 * Les cours récurrents ne passent PAS par ici : la vue mois les projette
 * elle-même à partir de /api/cours, qui reste la source de la semaine type.
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const debut = new Date(`${String(req.query.debut || '').slice(0, 10)}T00:00:00Z`);
    const fin = new Date(`${String(req.query.fin || '').slice(0, 10)}T23:59:59Z`);
    if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
      return sendError(res, 'Paramètres debut et fin requis (AAAA-MM-JJ).', 400);
    }
    // Un événement est visible s'il CHEVAUCHE la fenêtre : une compétition
    // du 29 au 2 doit apparaître dans les deux mois concernés.
    const evenements = await prisma.evenement.findMany({
      where: {
        actif: true,
        date: { lte: fin },
        OR: [{ dateFin: null, date: { gte: debut, lte: fin } }, { dateFin: { gte: debut } }],
      },
      orderBy: { date: 'asc' },
      include: { _count: { select: { inscriptions: true } } },
    });
    return sendSuccess(res, evenements.map((e) => ({ ...e, nbInscriptions: e._count.inscriptions, _count: undefined })));
  } catch (error) {
    console.error('Erreur GET /api/calendrier:', error);
    return sendError(res, 'Erreur lors du chargement du calendrier', 500);
  }
});

// ---------- Sources (abonnements .ics des fédérations) ----------

router.get('/sources', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<any> => {
  try {
    const sources = await prisma.calendrierSource.findMany({ orderBy: { nom: 'asc' } });
    return sendSuccess(res, sources);
  } catch {
    return sendError(res, 'Erreur lors du chargement des sources', 500);
  }
});

const sourceSchema = z.object({
  code: z.string().min(1).max(40).regex(/^[A-Z0-9_]+$/, 'Code en MAJUSCULES, sans espace (ex. KARATE_QUEBEC)'),
  nom: z.string().min(1),
  url: z.string().url("L'adresse du calendrier doit être une URL valide (lien .ics)"),
  discipline: z.enum(['KARATE', 'JUDO', 'NINJAS', 'TOUS']).optional().nullable(),
  actif: z.boolean().optional(),
});

router.post('/sources', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = sourceSchema.parse(req.body);
    const source = await prisma.calendrierSource.create({ data });
    logAudit(req, { action: 'CREATE', entity: 'CalendrierSource', entityId: source.id, description: `Source calendrier ajoutée : ${source.nom}` });
    return sendSuccess(res, source, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2002') return sendError(res, 'Ce code de source existe déjà.', 409);
    return sendError(res, "Erreur lors de l'ajout de la source", 500);
  }
});

router.put('/sources/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = sourceSchema.partial().parse(req.body);
    const source = await prisma.calendrierSource.update({ where: { id: req.params.id }, data });
    return sendSuccess(res, source);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors de la mise à jour', 500);
  }
});

// La suppression d'une source NE supprime PAS les événements déjà importés :
// ceux que le club a retenus (et leurs inscriptions) doivent survivre.
router.delete('/sources/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.calendrierSource.delete({ where: { id: req.params.id } });
    return sendSuccess(res, { ok: true });
  } catch {
    return sendError(res, 'Erreur lors de la suppression', 500);
  }
});

// ---------- Synchronisation ----------

async function synchroniser(source: { id: string; code: string; url: string; discipline: string | null }) {
  const reponse = await fetch(source.url, {
    headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!reponse.ok) throw new Error(`La source a répondu ${reponse.status}`);
  const texte = await reponse.text();
  if (texte.length > TAILLE_MAX_ICS) throw new Error('Fichier de calendrier trop volumineux.');
  if (!texte.includes('BEGIN:VCALENDAR')) {
    throw new Error("Ce lien ne renvoie pas un calendrier iCal (.ics). Vérifiez l'adresse d'abonnement.");
  }

  const { evenements } = parseIcal(texte);
  let ajoutes = 0;
  let majs = 0;

  for (const e of evenements) {
    const existant = await prisma.evenement.findUnique({
      where: { source_sourceUid: { source: source.code, sourceUid: e.uid } },
    });

    // Un événement RETENU par le club a pu être enrichi à la main (frais,
    // discipline, note) : la synchronisation ne réécrit que les champs qui
    // appartiennent à la fédération, et ne touche jamais au statut.
    const champsFederation = {
      titre: e.titre,
      date: e.date,
      dateFin: e.dateFin.getTime() === e.date.getTime() ? null : e.dateFin,
      horaire: e.horaire,
      lieu: e.lieu,
    };

    if (existant) {
      await prisma.evenement.update({ where: { id: existant.id }, data: champsFederation });
      majs++;
    } else {
      await prisma.evenement.create({
        data: {
          ...champsFederation,
          type: deviner(e.titre),
          discipline: source.discipline,
          note: e.description || null,
          statut: 'CALENDRIER', // informatif tant que le club ne l'a pas retenu
          source: source.code,
          sourceUid: e.uid,
        },
      });
      ajoutes++;
    }
  }
  return { ajoutes, majs, lus: evenements.length };
}

// POST /api/calendrier/sources/:id/sync — synchronise une source.
router.post('/sources/:id/sync', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  const source = await prisma.calendrierSource.findUnique({ where: { id: req.params.id } });
  if (!source) return sendError(res, 'Source introuvable', 404);
  try {
    const bilan = await synchroniser(source);
    const message = `${bilan.lus} date(s) lue(s) : ${bilan.ajoutes} ajoutée(s), ${bilan.majs} mise(s) à jour.`;
    await prisma.calendrierSource.update({
      where: { id: source.id },
      data: { dernierSyncAt: new Date(), dernierSyncMsg: message },
    });
    logAudit(req, { action: 'UPDATE', entity: 'CalendrierSource', entityId: source.id, description: `Synchronisation ${source.nom} — ${message}` });
    return sendSuccess(res, { ok: true, message, ...bilan });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.calendrierSource.update({
      where: { id: source.id },
      data: { dernierSyncAt: new Date(), dernierSyncMsg: `Échec : ${message}` },
    });
    logAudit(req, { action: 'ERREUR', entity: 'CalendrierSource', entityId: source.id, description: `Synchronisation ${source.nom} échouée : ${message}` });
    return sendError(res, `Synchronisation impossible : ${message}`, 502);
  }
});

export default router;

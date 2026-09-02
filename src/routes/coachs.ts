import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { z } from 'zod';
import { heuresCoachsPourMois, estMoisEcoule } from '../lib/paieCoachs';

const router = Router();

// Génère un mot de passe temporaire alphanumérique (à communiquer au coach, puis à changer).
function generateTempPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 12);
}

const coachSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').optional(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional().nullable(),
  role: z.enum(['COACH', 'SECTION_MANAGER', 'ADMIN']),
  section: z.string().optional().nullable(),
  remuneration: z.number().optional().default(0),
  // Paie à l'heure ($/h net — les salaires ne portent pas de taxes). Renseigné,
  // il PRIME : paie du mois = séances tenues de ses cours × durée × taux.
  // Null/absent : la rémunération forfaitaire ci-dessus s'applique.
  tauxHoraire: z.number().nonnegative().optional().nullable(),
  actif: z.boolean().optional().default(true),
  dateDebut: z.string().optional(),
  note: z.string().optional().nullable()
});

// Garde-fou : refuse toute modification qui laisserait le centre sans
// administrateur actif (rétrogradation ou désactivation du dernier ADMIN).
async function seraitDernierAdmin(id: string, changes: { role?: string; actif?: boolean }): Promise<boolean> {
  const cible = await prisma.user.findUnique({ where: { id } });
  if (!cible || cible.role !== 'ADMIN' || !cible.actif) return false;
  const perdAdmin = (changes.role !== undefined && changes.role !== 'ADMIN') || changes.actif === false;
  if (!perdAdmin) return false;
  const autresAdmins = await prisma.user.count({ where: { role: 'ADMIN', actif: true, id: { not: id } } });
  return autresAdmins === 0;
}

// POST /api/coachs
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = coachSchema.parse(req.body);
    
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return sendError(res, 'Cet email est déjà utilisé', 400);

    // Si l'admin ne fournit pas de mot de passe, on en génère un temporaire qu'on retourne une seule fois.
    const plainPassword = data.password || generateTempPassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const coach = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role,
        section: data.section,
        remuneration: data.remuneration,
        tauxHoraire: data.tauxHoraire ?? null,
        actif: data.actif,
        dateDebut: data.dateDebut ? new Date(data.dateDebut) : new Date(),
        note: data.note
      }
    });

    logAudit(req, {
      action: 'CREATE',
      entity: 'User',
      entityId: coach.id,
      description: `${coach.firstName} ${coach.lastName} (${coach.email}) — rôle ${coach.role}`,
    });

    const { passwordHash: _, ...coachWithoutPass } = coach;
    return sendSuccess(res, {
      ...coachWithoutPass,
      // Mot de passe temporaire renvoyé uniquement quand l'admin n'en a pas fourni.
      ...(data.password ? {} : { tempPassword: plainPassword }),
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de création du coach', 500);
  }
});

// GET /api/coachs
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const coachs = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'COACH', 'SECTION_MANAGER'] } },
      orderBy: { lastName: 'asc' }
    });
    
    return sendSuccess(res, coachs.map(c => {
      const { passwordHash, ...rest } = c;
      return rest;
    }));
  } catch (error) {
    return sendError(res, 'Erreur de récupération des coachs', 500);
  }
});

// GET /api/coachs/heures?mois&annee — réconciliation mensuelle de la paie :
// heures TENUES (séances réellement pointées × durée) et PRÉVUES (calendrier)
// par coach assigné à des cours ; paie au taux quand il existe, écart vs le
// forfait de référence. On paie sur le relevé, plus sur l'habitude.
// (Déclarée AVANT « /:id » : sinon « heures » serait pris pour un identifiant.)
router.get('/heures', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const isoAuj = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
    const mois = parseInt(req.query.mois as string, 10) || Number(isoAuj.slice(5, 7));
    const annee = parseInt(req.query.annee as string, 10) || Number(isoAuj.slice(0, 4));
    if (mois < 1 || mois > 12 || annee < 2000 || annee > 2100) return sendError(res, 'Mois ou année invalide', 400);

    const arr2 = (n: number) => Math.round(n * 100) / 100;
    const [users, heures] = await Promise.all([
      prisma.user.findMany({
        where: { actif: true },
        select: { id: true, firstName: true, lastName: true, role: true, remuneration: true, tauxHoraire: true },
      }),
      heuresCoachsPourMois(mois, annee),
    ]);
    const moisEcoule = estMoisEcoule(mois, annee);

    const coachs = users
      // Dans la réconciliation : quiconque a des cours assignés, un taux
      // horaire, OU une paie forfaitaire — un coach payé SANS aucun cours
      // assigné doit se voir (c'est un trou du relevé, pas un détail).
      .filter((u) => heures.has(u.id) || u.tauxHoraire !== null || (u.remuneration ?? 0) > 0)
      .map((u) => {
        const h = heures.get(u.id) || { heuresTenues: 0, heuresPrevues: 0, cours: [] };
        const taux = u.tauxHoraire;
        const paieTenue = taux !== null ? arr2(h.heuresTenues * taux) : null;
        const paiePrevue = taux !== null ? arr2(h.heuresPrevues * taux) : null;
        // Ce qui entre dans la masse salariale du mois (même règle que
        // masseSalarialePourMois) : réel pour un mois écoulé, prévu sinon.
        const paieRetenue = taux !== null ? (moisEcoule ? paieTenue! : paiePrevue!) : arr2(u.remuneration ?? 0);
        return {
          id: u.id,
          nom: [u.firstName, u.lastName].filter(Boolean).join(' '),
          role: u.role,
          mode: taux !== null ? 'TAUX' : 'FORFAIT',
          tauxHoraire: taux,
          forfait: arr2(u.remuneration ?? 0),
          heuresTenues: h.heuresTenues,
          heuresPrevues: h.heuresPrevues,
          seancesTenues: h.cours.reduce((a, c) => a + c.seancesTenues, 0),
          seancesPrevues: h.cours.reduce((a, c) => a + c.seancesPrevues, 0),
          cours: h.cours,
          paieTenue,
          paiePrevue,
          paieRetenue,
          // L'écart vs l'habitude : ce que le relevé change au forfait historique.
          ecartVsForfait: taux !== null && (u.remuneration ?? 0) > 0 ? arr2(paieRetenue - (u.remuneration ?? 0)) : null,
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom));

    return sendSuccess(res, { mois, annee, moisEcoule, coachs });
  } catch (error) {
    console.error('Error in GET /api/coachs/heures:', error);
    return sendError(res, 'Erreur du calcul des heures des coachs', 500);
  }
});

// GET /api/coachs/:id
router.get('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const coach = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!coach) return sendError(res, 'Coach introuvable', 404);
    
    const { passwordHash, ...rest } = coach;
    return sendSuccess(res, rest);
  } catch (error) {
    return sendError(res, 'Erreur de récupération du coach', 500);
  }
});

// PUT /api/coachs/:id
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const updateSchema = coachSchema.partial();
    const data = updateSchema.parse(req.body);

    if (await seraitDernierAdmin(id, data)) {
      return sendError(res, "Impossible : ce compte est le dernier administrateur actif du centre.", 400);
    }

    let updateData: any = { ...data };
    if (data.dateDebut) updateData.dateDebut = new Date(data.dateDebut);
    // Ne jamais stocker le mot de passe en clair : on le hache et on retire le champ brut.
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }
    delete updateData.password;

    const coach = await prisma.user.update({
      where: { id },
      data: updateData
    });

    logAudit(req, {
      action: 'UPDATE',
      entity: 'User',
      entityId: coach.id,
      description: `${coach.firstName} ${coach.lastName} (${coach.email})${data.password ? ' — mot de passe changé' : ''}${data.role ? ` — rôle ${coach.role}` : ''}${'tauxHoraire' in data ? ` — taux horaire ${coach.tauxHoraire === null ? 'retiré (retour au forfait)' : coach.tauxHoraire + ' $/h'}` : ''}`,
    });

    const { passwordHash, ...rest } = coach;
    return sendSuccess(res, rest);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de modification', 500);
  }
});

// DELETE /api/coachs/:id (Soft delete)
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    if (await seraitDernierAdmin(id, { actif: false })) {
      return sendError(res, "Impossible : ce compte est le dernier administrateur actif du centre.", 400);
    }

    // soft delete
    const desactive = await prisma.user.update({
      where: { id },
      data: { actif: false }
    });

    logAudit(req, {
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      description: `Compte désactivé : ${desactive.firstName} ${desactive.lastName} (${desactive.email})`,
    });

    return sendSuccess(res, { message: 'Coach désactivé' });
  } catch (error) {
    return sendError(res, 'Erreur lors de la désactivation', 500);
  }
});

export default router;

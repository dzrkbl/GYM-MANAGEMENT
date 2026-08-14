import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { porteeStaff, disciplineDansPortee } from '../lib/portee';
import { logAudit } from '../lib/audit';
import { saisonPourDate } from '../lib/saison';
import { z } from 'zod';

// Événements : compétitions, passages de grade, événements spéciaux.
// L'admissibilité d'un athlète est signalée (jamais bloquée) sur deux axes :
//  1. affiliation fédération valide pour la discipline et la SAISON DE
//     L'ÉVÉNEMENT (sept. → août) — c'est elle qui détermine la participation ;
//  2. solde dû au club sur l'abonnement (versements en retard, reste impayé,
//     renouvellement échu) — flag demandé par le propriétaire.
// Les frais d'inscription transitent vers la fédération : PAS un revenu club.

const router = Router();

const evenementSchema = z.object({
  titre: z.string().min(1),
  type: z.enum(['COMPETITION', 'PASSAGE_GRADE', 'AUTRE']).default('COMPETITION'),
  discipline: z.enum(['KARATE', 'JUDO', 'NINJAS', 'TOUS']).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lieu: z.string().optional().nullable(),
  fraisInscription: z.number().min(0).optional().nullable(),
  note: z.string().optional().nullable(),
  actif: z.boolean().optional(),
});

// Début du jour civil de Montréal, ancré UTC (mêmes conventions que reminders).
function debutJourMontreal(): Date {
  const iso = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
  return new Date(`${iso}T00:00:00Z`);
}

interface MembrePourSolde {
  status: string;
  montantFinal: number | null;
  finContrat: Date | null;
  versements: { montant: number; datePrevue: Date; datePaiement: Date | null }[];
}

// Solde dû au club sur l'abonnement (indépendant des frais fédération).
// Renvoie null si rien à signaler.
function bilanSoldeGym(membre: MembrePourSolde): {
  total: number;
  enRetard: number;
  renouvellementEchu: boolean;
  finContrat: string | null;
} | null {
  const debutJour = debutJourMontreal();
  const totalPaye = membre.versements
    .filter((v) => v.datePaiement)
    .reduce((s, v) => s + (v.montant || 0), 0);
  const reste = Math.round(((membre.montantFinal || 0) - totalPaye) * 100) / 100;
  const enRetard = Math.round(
    membre.versements
      .filter((v) => !v.datePaiement && v.montant > 0 && v.datePrevue < debutJour)
      .reduce((s, v) => s + v.montant, 0) * 100
  ) / 100;
  // Le renouvellement échu ne concerne que les membres encore actifs.
  const renouvellementEchu = membre.status === 'ACTIF' && !!membre.finContrat && membre.finContrat < debutJour;

  if (reste <= 0 && enRetard <= 0 && !renouvellementEchu) return null;
  return {
    total: Math.max(reste, 0),
    enRetard,
    renouvellementEchu,
    finContrat: membre.finContrat ? membre.finContrat.toISOString() : null,
  };
}

const SELECT_MEMBRE_ADMISSIBILITE = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  montantFinal: true,
  finContrat: true,
  sections: { select: { section: true } },
  versements: { select: { montant: true, datePrevue: true, datePaiement: true } },
} as const;

// Admissibilité d'un membre pour un événement donné.
async function admissibilite(evenement: { date: Date; discipline: string | null }, membreId: string) {
  const membre = await prisma.member.findUnique({ where: { id: membreId }, select: SELECT_MEMBRE_ADMISSIBILITE });
  if (!membre) return null;
  const saisonRequise = saisonPourDate(evenement.date);
  const verifAffiliation = evenement.discipline === 'KARATE' || evenement.discipline === 'JUDO';
  const affiliation = verifAffiliation
    ? await prisma.affiliation.findUnique({
        where: { membreId_discipline_saison: { membreId, discipline: evenement.discipline!, saison: saisonRequise } },
      })
    : null;
  return {
    saisonRequise,
    affiliationOk: verifAffiliation ? !!affiliation : null, // null = non applicable
    affiliation: affiliation ? { id: affiliation.id, numero: affiliation.numero, saison: affiliation.saison } : null,
    solde: bilanSoldeGym(membre),
  };
}

// GET /api/evenements — liste avec nombre d'inscrits.
// Staff : événements de sa discipline + événements « TOUS » du club.
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { inclureInactifs } = req.query as Record<string, string>;
    const portee = await porteeStaff(req.user!);
    const where: any = inclureInactifs ? {} : { actif: true };
    if (!portee.admin) {
      where.OR = [{ discipline: null }, { discipline: 'TOUS' }, ...(portee.sport ? [{ discipline: portee.sport }] : [])];
    }
    const evenements = await prisma.evenement.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: { _count: { select: { inscriptions: true } } },
    });
    return sendSuccess(res, evenements);
  } catch {
    return sendError(res, 'Erreur de récupération des événements', 500);
  }
});

// GET /api/evenements/:id — détail avec inscriptions + admissibilité calculée.
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const evenement = await prisma.evenement.findUnique({
      where: { id: req.params.id },
      include: {
        inscriptions: {
          orderBy: { createdAt: 'asc' },
          include: { member: { select: SELECT_MEMBRE_ADMISSIBILITE } },
        },
      },
    });
    if (!evenement) return sendError(res, 'Événement introuvable', 404);
    const porteeLecture = await porteeStaff(req.user!);
    if (!disciplineDansPortee(evenement.discipline, porteeLecture)) {
      return sendError(res, "Cet événement n'appartient pas à votre discipline", 403);
    }

    const saisonRequise = saisonPourDate(evenement.date);
    const verifAffiliation = evenement.discipline === 'KARATE' || evenement.discipline === 'JUDO';

    // Une seule requête pour toutes les affiliations utiles.
    const affiliations = verifAffiliation
      ? await prisma.affiliation.findMany({
          where: {
            discipline: evenement.discipline!,
            saison: saisonRequise,
            membreId: { in: evenement.inscriptions.map((i) => i.membreId) },
          },
        })
      : [];
    const parMembre = new Map(affiliations.map((a) => [a.membreId, a]));

    const inscriptions = evenement.inscriptions.map((i) => {
      const a = parMembre.get(i.membreId);
      const { versements: _v, montantFinal: _m, ...membrePublic } = i.member;
      return {
        id: i.id,
        membreId: i.membreId,
        fraisPaye: i.fraisPaye,
        note: i.note,
        createdAt: i.createdAt,
        member: membrePublic,
        admissibilite: {
          saisonRequise,
          affiliationOk: verifAffiliation ? !!a : null,
          affiliation: a ? { id: a.id, numero: a.numero, saison: a.saison } : null,
          solde: bilanSoldeGym(i.member),
        },
      };
    });

    const { inscriptions: _i, ...evenementSansInscriptions } = evenement;
    return sendSuccess(res, { ...evenementSansInscriptions, saisonRequise, inscriptions });
  } catch {
    return sendError(res, "Erreur de récupération de l'événement", 500);
  }
});

// POST /api/evenements — le staff crée uniquement dans sa discipline.
router.post('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = evenementSchema.parse(req.body);
    const portee = await porteeStaff(req.user!);
    if (!portee.admin && data.discipline !== portee.sport) {
      return sendError(res, 'Vous ne pouvez créer un événement que dans votre discipline', 403);
    }
    const evenement = await prisma.evenement.create({
      data: { ...data, date: new Date(`${data.date}T12:00:00Z`) },
    });
    logAudit(req, {
      action: 'CREATE',
      entity: 'Evenement',
      entityId: evenement.id,
      description: `Événement créé : ${evenement.titre} (${evenement.type}) — ${data.date}`,
    });
    return sendSuccess(res, evenement, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, "Erreur de création de l'événement", 500);
  }
});

// PUT /api/evenements/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = evenementSchema.partial().parse(req.body);
    const portee = await porteeStaff(req.user!);
    if (!portee.admin) {
      const existant = await prisma.evenement.findUnique({ where: { id: req.params.id } });
      if (!existant) return sendError(res, 'Événement introuvable', 404);
      if (existant.discipline !== portee.sport || (data.discipline && data.discipline !== portee.sport)) {
        return sendError(res, 'Événement hors de votre discipline', 403);
      }
    }
    const updateData: any = { ...data };
    if (data.date) updateData.date = new Date(`${data.date}T12:00:00Z`);
    const evenement = await prisma.evenement.update({ where: { id: req.params.id }, data: updateData });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'Evenement',
      entityId: evenement.id,
      description: `Événement modifié : ${evenement.titre}`,
    });
    return sendSuccess(res, evenement);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2025') return sendError(res, 'Événement introuvable', 404);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// DELETE /api/evenements/:id — suppression si aucune inscription, sinon
// désactivation (l'historique des participations est conservé).
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const evenement = await prisma.evenement.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { inscriptions: true } } },
    });
    if (!evenement) return sendError(res, 'Événement introuvable', 404);
    const portee = await porteeStaff(req.user!);
    if (!portee.admin && evenement.discipline !== portee.sport) {
      return sendError(res, 'Événement hors de votre discipline', 403);
    }

    if (evenement._count.inscriptions > 0) {
      await prisma.evenement.update({ where: { id: evenement.id }, data: { actif: false } });
      logAudit(req, { action: 'UPDATE', entity: 'Evenement', entityId: evenement.id, description: `Événement archivé (inscriptions existantes) : ${evenement.titre}` });
      return sendSuccess(res, { message: 'Événement archivé (des inscriptions y sont rattachées)' });
    }

    await prisma.evenement.delete({ where: { id: evenement.id } });
    logAudit(req, { action: 'DELETE', entity: 'Evenement', entityId: evenement.id, description: `Événement supprimé : ${evenement.titre}` });
    return sendSuccess(res, { message: 'Événement supprimé' });
  } catch {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

// POST /api/evenements/:id/inscriptions — inscrit un athlète et renvoie son
// admissibilité (affiliation + solde) pour affichage immédiat.
router.post('/:id/inscriptions', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { membreId, note } = z.object({ membreId: z.string().min(1), note: z.string().optional().nullable() }).parse(req.body);
    const evenement = await prisma.evenement.findUnique({ where: { id: req.params.id } });
    if (!evenement) return sendError(res, 'Événement introuvable', 404);
    const porteeIns = await porteeStaff(req.user!);
    if (!porteeIns.admin && evenement.discipline !== porteeIns.sport) {
      return sendError(res, "Inscriptions réservées à l'admin pour cet événement", 403);
    }
    const membre = await prisma.member.findUnique({ where: { id: membreId }, select: { firstName: true, lastName: true } });
    if (!membre) return sendError(res, 'Membre introuvable', 404);

    const inscription = await prisma.evenementInscription.create({
      data: { evenementId: evenement.id, membreId, note: note || null },
    });
    const adm = await admissibilite(evenement, membreId);

    logAudit(req, {
      action: 'CREATE',
      entity: 'EvenementInscription',
      entityId: inscription.id,
      description: `Inscription : ${membre.firstName} ${membre.lastName} → ${evenement.titre}`,
    });
    return sendSuccess(res, { ...inscription, admissibilite: adm }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2002') return sendError(res, 'Cet athlète est déjà inscrit à cet événement', 400);
    return sendError(res, "Erreur d'inscription", 500);
  }
});

// PATCH /api/evenements/:id/inscriptions/:inscriptionId — frais remis / note.
router.patch('/:id/inscriptions/:inscriptionId', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = z.object({ fraisPaye: z.boolean().optional(), note: z.string().optional().nullable() }).parse(req.body);
    const porteePatch = await porteeStaff(req.user!);
    if (!porteePatch.admin) {
      const evt = await prisma.evenement.findUnique({ where: { id: req.params.id }, select: { discipline: true } });
      if (!evt || evt.discipline !== porteePatch.sport) return sendError(res, 'Événement hors de votre discipline', 403);
    }
    const inscription = await prisma.evenementInscription.update({
      where: { id: req.params.inscriptionId },
      data,
      include: { member: { select: { firstName: true, lastName: true } }, evenement: { select: { titre: true } } },
    });
    if (data.fraisPaye !== undefined) {
      logAudit(req, {
        action: 'UPDATE',
        entity: 'EvenementInscription',
        entityId: inscription.id,
        description: `Frais ${data.fraisPaye ? 'remis' : 'non remis'} : ${inscription.member.firstName} ${inscription.member.lastName} — ${inscription.evenement.titre}`,
      });
    }
    return sendSuccess(res, inscription);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2025') return sendError(res, 'Inscription introuvable', 404);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// DELETE /api/evenements/:id/inscriptions/:inscriptionId
router.delete('/:id/inscriptions/:inscriptionId', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const porteeDel = await porteeStaff(req.user!);
    if (!porteeDel.admin) {
      const evt = await prisma.evenement.findUnique({ where: { id: req.params.id }, select: { discipline: true } });
      if (!evt || evt.discipline !== porteeDel.sport) return sendError(res, 'Événement hors de votre discipline', 403);
    }
    const inscription = await prisma.evenementInscription.delete({
      where: { id: req.params.inscriptionId },
      include: { member: { select: { firstName: true, lastName: true } }, evenement: { select: { titre: true } } },
    });
    logAudit(req, {
      action: 'DELETE',
      entity: 'EvenementInscription',
      entityId: inscription.id,
      description: `Inscription retirée : ${inscription.member.firstName} ${inscription.member.lastName} — ${inscription.evenement.titre}`,
    });
    return sendSuccess(res, { message: 'Inscription retirée' });
  } catch (error: any) {
    if (error?.code === 'P2025') return sendError(res, 'Inscription introuvable', 404);
    return sendError(res, 'Erreur de suppression', 500);
  }
});

export default router;

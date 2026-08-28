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
  type: z.enum(['COMPETITION', 'PASSAGE_GRADE', 'FORMATION', 'FERMETURE', 'AUTRE']).default('COMPETITION'),
  discipline: z.enum(['KARATE', 'JUDO', 'NINJAS', 'TOUS']).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Dernier jour INCLUS : compétition d'une fin de semaine, fermeture des Fêtes…
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  horaire: z.string().max(40).optional().nullable(),
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
    const { inclureInactifs, statut } = req.query as Record<string, string>;
    const portee = await porteeStaff(req.user!);
    const where: any = inclureInactifs ? {} : { actif: true };
    // Par défaut le module Événements ne montre que ce que le club a RETENU ;
    // les dates de fédération importées vivent dans le calendrier de saison.
    // ?statut=TOUS pour tout voir, ?statut=CALENDRIER pour la liste à trier.
    if (statut !== 'TOUS') where.statut = statut === 'CALENDRIER' ? 'CALENDRIER' : 'RETENU';
    if (!portee.admin) {
      where.OR = [{ discipline: null }, { discipline: 'TOUS' }, ...portee.sports.map((sp) => ({ discipline: sp }))];
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
    if (!portee.admin && (!data.discipline || !portee.sports.includes(data.discipline))) {
      return sendError(res, 'Vous ne pouvez créer un événement que dans votre discipline', 403);
    }
    const evenement = await prisma.evenement.create({
      data: {
        ...data,
        date: new Date(`${data.date}T12:00:00Z`),
        dateFin: data.dateFin ? new Date(`${data.dateFin}T12:00:00Z`) : null,
      },
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
      if (!existant.discipline || !portee.sports.includes(existant.discipline) || (data.discipline && !portee.sports.includes(data.discipline))) {
        return sendError(res, 'Événement hors de votre discipline', 403);
      }
    }
    const updateData: any = { ...data };
    if (data.date) updateData.date = new Date(`${data.date}T12:00:00Z`);
    if (data.dateFin !== undefined) {
      updateData.dateFin = data.dateFin ? new Date(`${data.dateFin}T12:00:00Z`) : null;
    }
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

// PATCH /api/evenements/:id/statut — le bouton « Intégrer au module Événements ».
// CALENDRIER : date de fédération, informative, aucune inscription possible.
// RETENU : le club y participe — inscriptions, frais et admissibilité s'activent.
router.patch('/:id/statut', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { statut } = z.object({ statut: z.enum(['CALENDRIER', 'RETENU']) }).parse(req.body);
    const existant = await prisma.evenement.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { inscriptions: true } } },
    });
    if (!existant) return sendError(res, 'Événement introuvable', 404);

    const portee = await porteeStaff(req.user!);
    if (!portee.admin && !disciplineDansPortee(existant.discipline, portee)) {
      return sendError(res, 'Événement hors de votre discipline', 403);
    }
    // Remettre au calendrier un événement qui a déjà des inscrits ferait
    // disparaître ces inscriptions de la vue : on refuse plutôt que de surprendre.
    if (statut === 'CALENDRIER' && existant._count.inscriptions > 0) {
      return sendError(res, `Cet événement compte ${existant._count.inscriptions} inscription(s) : retirez-les d'abord.`, 409);
    }

    const evenement = await prisma.evenement.update({ where: { id: existant.id }, data: { statut } });
    logAudit(req, {
      action: 'UPDATE', entity: 'Evenement', entityId: evenement.id,
      description: statut === 'RETENU'
        ? `Événement retenu par le club : ${evenement.titre}`
        : `Événement remis au calendrier de saison : ${evenement.titre}`,
    });
    return sendSuccess(res, evenement);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Statut invalide', 400, error.issues);
    return sendError(res, 'Erreur lors du changement de statut', 500);
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
    if (!portee.admin && (!evenement.discipline || !portee.sports.includes(evenement.discipline))) {
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
    // Une date de fédération non retenue (statut CALENDRIER) n'accepte aucune
    // inscription — même règle que l'interface, appliquée aussi à l'API.
    if (evenement.statut === 'CALENDRIER') {
      return sendError(res, "Cet événement n'est pas encore retenu par le club — retenez-le d'abord", 400);
    }
    const porteeIns = await porteeStaff(req.user!);
    if (!porteeIns.admin && (!evenement.discipline || !porteeIns.sports.includes(evenement.discipline))) {
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
    // La portée se vérifie sur l'événement RÉEL de l'inscription — pas sur
    // celui de l'URL, sinon un id d'inscription étranger (glané sur un
    // événement « TOUS ») permettrait de modifier hors de sa discipline.
    const existante = await prisma.evenementInscription.findUnique({
      where: { id: req.params.inscriptionId },
      select: { id: true, evenementId: true, evenement: { select: { discipline: true } } },
    });
    if (!existante || existante.evenementId !== req.params.id) return sendError(res, 'Inscription introuvable', 404);
    const porteePatch = await porteeStaff(req.user!);
    if (!porteePatch.admin) {
      const disc = existante.evenement.discipline;
      if (!disc || !porteePatch.sports.includes(disc)) return sendError(res, 'Événement hors de votre discipline', 403);
    }
    const inscription = await prisma.evenementInscription.update({
      where: { id: existante.id },
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
    // Même garde que le PATCH : l'inscription doit appartenir à l'événement
    // de l'URL, et la portée se juge sur SA discipline.
    const aRetirer = await prisma.evenementInscription.findUnique({
      where: { id: req.params.inscriptionId },
      select: { id: true, evenementId: true, evenement: { select: { discipline: true } } },
    });
    if (!aRetirer || aRetirer.evenementId !== req.params.id) return sendError(res, 'Inscription introuvable', 404);
    const porteeDel = await porteeStaff(req.user!);
    if (!porteeDel.admin) {
      const disc = aRetirer.evenement.discipline;
      if (!disc || !porteeDel.sports.includes(disc)) return sendError(res, 'Événement hors de votre discipline', 403);
    }
    const inscription = await prisma.evenementInscription.delete({
      where: { id: aRetirer.id },
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

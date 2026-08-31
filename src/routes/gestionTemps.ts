import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { dateAMidi } from '../lib/tarifs';
import { calculerPointsAuto } from '../lib/pointsAuto';
import { reglementTrimestre, saisonCourante } from '../lib/pointsPartage';

/**
 * Module « Points & partage » (entente de redevabilité entre les associées).
 * TOUT est réservé aux ADMIN (les deux associées) et TOUT est journalisé
 * sous les entités Bareme / PlanTache / TacheRecurrente / AcompteAssocie —
 * la section « Gestion du temps » du journal d'audit. C'est la contrepartie
 * de la modifiabilité totale : on peut tout changer, jamais en cachette
 * (entente, art. 3.9, 4.3 et 6.4).
 */

const router = Router();
const admin = [authenticate, requireRole(['ADMIN'])] as const;

const isoJour = (d: Date) => d.toISOString().slice(0, 10);
const aujourdhuiMontreal = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
const arrondir = (n: number) => Math.round(n * 100) / 100;

function pointsPour(tache: { mode: string; valeur: number; supplement: number }, quantite: number, duree?: number | null): number {
  const unitaire = tache.mode === 'DUREE' ? tache.valeur * (duree || 0) + tache.supplement : tache.valeur + tache.supplement;
  return arrondir(unitaire * (quantite || 1));
}

// Les deux associées (comptes ADMIN actifs) — pour les listes de l'interface.
router.get('/associes', ...admin, async (_req: Request, res: Response): Promise<any> => {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', actif: true },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return sendSuccess(res, admins.map((a) => ({ id: a.id, nom: [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email })));
});

// ==================== BARÈME ====================

router.get('/bareme', ...admin, async (_req: Request, res: Response): Promise<any> => {
  const lignes = await prisma.tachePoints.findMany({ orderBy: [{ famille: 'asc' }, { nom: 'asc' }] });
  return sendSuccess(res, lignes);
});

const baremeSchema = z.object({
  famille: z.string().min(1).max(30),
  nom: z.string().min(1).max(160),
  mode: z.enum(['FIXE', 'DUREE']),
  valeur: z.number().min(0).max(100),
  supplement: z.number().min(0).max(10).optional().default(0),
  preuve: z.enum(['APP', 'DECL']),
  note: z.string().max(300).optional().nullable(),
  actif: z.boolean().optional(),
});

router.post('/bareme', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = baremeSchema.parse(req.body);
    const ligne = await prisma.tachePoints.create({ data: { ...data, note: data.note || null } });
    logAudit(req, {
      action: 'CREATE', entity: 'Bareme', entityId: ligne.id,
      description: `Barème + « ${ligne.nom} » (${ligne.famille}) : ${ligne.mode === 'DUREE' ? `${ligne.valeur} × durée` : `${ligne.valeur} pt`}${ligne.supplement ? ` + ${ligne.supplement}` : ''} [${ligne.preuve}]`,
    });
    return sendSuccess(res, ligne, 201);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    if (e?.code === 'P2002') return sendError(res, 'Une tâche porte déjà ce nom au barème', 409);
    return sendError(res, "Erreur d'ajout au barème", 500);
  }
});

router.put('/bareme/:id', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = baremeSchema.partial().parse(req.body);
    const avant = await prisma.tachePoints.findUnique({ where: { id: req.params.id } });
    if (!avant) return sendError(res, 'Ligne introuvable', 404);
    const ligne = await prisma.tachePoints.update({ where: { id: avant.id }, data: { ...data, note: data.note === undefined ? undefined : data.note || null } });
    // Journalisé AVANT → APRÈS : la modifiabilité libre repose sur cette trace
    // (les points déjà FIGÉS des tâches faites ne changent pas — jamais rétroactif).
    logAudit(req, {
      action: 'UPDATE', entity: 'Bareme', entityId: ligne.id,
      description: `Barème « ${avant.nom} » : ${avant.valeur}${avant.supplement ? `+${avant.supplement}` : ''} → ${ligne.valeur}${ligne.supplement ? `+${ligne.supplement}` : ''}${data.nom && data.nom !== avant.nom ? ` (renommée « ${ligne.nom} »)` : ''}${data.actif === false ? ' — DÉSACTIVÉE' : ''}`,
    });
    return sendSuccess(res, ligne);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, 'Erreur de modification du barème', 500);
  }
});

router.delete('/bareme/:id', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const ligne = await prisma.tachePoints.findUnique({ where: { id: req.params.id }, include: { _count: { select: { plans: true, recurrentes: true } } } });
    if (!ligne) return sendError(res, 'Ligne introuvable', 404);
    if (ligne.code) return sendError(res, 'Cette ligne est calculée automatiquement par l’application : désactivez-la plutôt que de la supprimer', 400);
    if (ligne._count.plans > 0 || ligne._count.recurrentes > 0) {
      await prisma.tachePoints.update({ where: { id: ligne.id }, data: { actif: false } });
      logAudit(req, { action: 'UPDATE', entity: 'Bareme', entityId: ligne.id, description: `Barème « ${ligne.nom} » désactivée (des tâches du plan y sont rattachées)` });
      return sendSuccess(res, { message: 'Ligne désactivée (elle a un historique)' });
    }
    await prisma.tachePoints.delete({ where: { id: ligne.id } });
    logAudit(req, { action: 'DELETE', entity: 'Bareme', entityId: ligne.id, description: `Barème « ${ligne.nom} » supprimée` });
    return sendSuccess(res, { message: 'Ligne supprimée' });
  } catch {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

// ==================== PLAN (instances datées) ====================

router.get('/plan', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const { de, a, statut } = req.query as Record<string, string>;
    const where: any = {};
    if (statut && statut !== 'TOUS') where.statut = statut;
    if (de || a) {
      where.dateLimite = {};
      if (de) where.dateLimite.gte = new Date(de + 'T00:00:00Z');
      if (a) where.dateLimite.lte = new Date(a + 'T23:59:59Z');
    }
    const taches = await prisma.planTache.findMany({
      where, orderBy: [{ dateLimite: 'asc' }],
      take: 500,
      include: { tache: { select: { nom: true, famille: true, mode: true, valeur: true, supplement: true, preuve: true, code: true } } },
    });
    return sendSuccess(res, taches);
  } catch {
    return sendError(res, 'Erreur de chargement du plan', 500);
  }
});

const planSchema = z.object({
  tacheId: z.string().min(1),
  dateLimite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assigneeId: z.string().min(1),
  quantite: z.number().positive().max(500).optional().default(1),
  duree: z.number().positive().max(200).optional().nullable(),
  note: z.string().max(300).optional().nullable(),
});

async function nomAssocie(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } });
  return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : 'Inconnue';
}

router.post('/plan', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = planSchema.parse(req.body);
    const assigneeNom = await nomAssocie(data.assigneeId);
    const t = await prisma.planTache.create({
      data: {
        tacheId: data.tacheId, dateLimite: dateAMidi(data.dateLimite),
        assigneeId: data.assigneeId, assigneeNom,
        quantite: data.quantite, duree: data.duree ?? null, note: data.note || null,
      },
      include: { tache: { select: { nom: true } } },
    });
    logAudit(req, {
      action: 'CREATE', entity: 'PlanTache', entityId: t.id,
      description: `Plan + « ${t.tache.nom} » → ${assigneeNom}, pour le ${data.dateLimite}`,
    });
    return sendSuccess(res, t, 201);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, "Erreur d'ajout au plan", 500);
  }
});

// Modification d'une tâche du plan — LIBRE et JOURNALISÉE, avec la seule
// exception de l'entente (art. 4.3.1, garde anti-esquive) : repousser SA
// PROPRE échéance quand la tâche est en défaut ou à moins de 24 h exige
// l'accord de l'autre (case « l'autre associée est d'accord »).
router.put('/plan/:id', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = planSchema.partial().extend({ accordAutre: z.boolean().optional() }).parse(req.body);
    const avant = await prisma.planTache.findUnique({ where: { id: req.params.id }, include: { tache: { select: { nom: true } } } });
    if (!avant) return sendError(res, 'Tâche introuvable', 404);
    if (avant.statut !== 'A_FAIRE') return sendError(res, 'Cette tâche est déjà réglée — annulez d’abord son « fait »', 400);

    if (data.dateLimite) {
      const nouvelle = dateAMidi(data.dateLimite);
      const auj = aujourdhuiMontreal();
      const enDefaut = isoJour(avant.dateLimite) < auj;
      const moinsDe24h = isoJour(avant.dateLimite) <= auj; // aujourd'hui même = fenêtre critique
      const repousse = nouvelle.getTime() > avant.dateLimite.getTime();
      if (repousse && req.user!.userId === avant.assigneeId && (enDefaut || moinsDe24h) && !data.accordAutre) {
        return sendError(res, "Garde anti-esquive : repousser votre propre échéance en défaut (ou le jour même) exige l'accord de l'autre associée — cochez la case d'accord après lui avoir parlé.", 400);
      }
    }

    const assigneeNom = data.assigneeId ? await nomAssocie(data.assigneeId) : undefined;
    const t = await prisma.planTache.update({
      where: { id: avant.id },
      data: {
        tacheId: data.tacheId,
        dateLimite: data.dateLimite ? dateAMidi(data.dateLimite) : undefined,
        assigneeId: data.assigneeId, assigneeNom,
        quantite: data.quantite, duree: data.duree === undefined ? undefined : data.duree,
        note: data.note === undefined ? undefined : data.note || null,
      },
    });
    const changements: string[] = [];
    if (data.dateLimite && isoJour(avant.dateLimite) !== data.dateLimite) changements.push(`échéance ${isoJour(avant.dateLimite)} → ${data.dateLimite}${data.accordAutre ? ' (accord de l’autre)' : ''}`);
    if (data.assigneeId && data.assigneeId !== avant.assigneeId) changements.push(`assignée ${avant.assigneeNom} → ${assigneeNom}`);
    if (data.quantite !== undefined && data.quantite !== avant.quantite) changements.push(`quantité ${avant.quantite} → ${data.quantite}`);
    if (data.duree !== undefined && data.duree !== avant.duree) changements.push(`durée ${avant.duree ?? '—'} → ${data.duree ?? '—'}`);
    logAudit(req, {
      action: 'UPDATE', entity: 'PlanTache', entityId: t.id,
      description: `Plan « ${avant.tache.nom} » modifiée : ${changements.length ? changements.join(' ; ') : 'note'}`,
    });
    return sendSuccess(res, t);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// « Fait » — les points se FIGENT ici (le barème peut changer ensuite sans
// réécrire l'histoire). Reprise par l'autre : possible à partir de J+3
// (entente, art. 5.2), 100 % des points à celle qui reprend.
router.patch('/plan/:id/fait', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = z.object({
      faitLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      duree: z.number().positive().max(200).optional().nullable(),
      quantite: z.number().positive().max(500).optional(),
      accordAutre: z.boolean().optional(),
    }).parse(req.body);

    const t = await prisma.planTache.findUnique({ where: { id: req.params.id }, include: { tache: true } });
    if (!t) return sendError(res, 'Tâche introuvable', 404);
    if (t.statut === 'FAIT' || t.statut === 'REPRIS') return sendError(res, 'Déjà réglée', 400);

    const u = req.user!;
    const estReprise = u.userId !== t.assigneeId;
    if (estReprise) {
      const auj = aujourdhuiMontreal();
      const j3 = new Date(t.dateLimite.getTime() + 3 * 86_400_000);
      if (auj < isoJour(j3) && !data.accordAutre) {
        return sendError(res, `La reprise n'est possible qu'à partir de J+3 (${isoJour(j3)}) — ou tout de suite avec l'accord de l'assignée (cochez la case).`, 400);
      }
    }

    const quantite = data.quantite ?? t.quantite;
    const duree = data.duree === undefined ? t.duree : data.duree;
    if (t.tache.mode === 'DUREE' && !duree) {
      return sendError(res, `« ${t.tache.nom} » se compte en heures : indiquez la durée`, 400);
    }
    const points = pointsPour(t.tache, quantite, duree);
    const faitLe = data.faitLe ? dateAMidi(data.faitLe) : dateAMidi(aujourdhuiMontreal());
    const faitParNom = await nomAssocie(u.userId);

    const regle = await prisma.planTache.update({
      where: { id: t.id },
      data: {
        statut: estReprise ? 'REPRIS' : 'FAIT',
        faitParId: u.userId, faitParNom, faitLe,
        quantite, duree, points,
      },
    });
    logAudit(req, {
      action: 'UPDATE', entity: 'PlanTache', entityId: t.id,
      description: estReprise
        ? `REPRISE : « ${t.tache.nom} » (assignée à ${t.assigneeNom}, échéance ${isoJour(t.dateLimite)}) faite par ${faitParNom} — ${points} pt à 100 %`
        : `Fait : « ${t.tache.nom} » par ${faitParNom} le ${isoJour(faitLe)} — ${points} pt`,
    });
    return sendSuccess(res, regle);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, 'Erreur', 500);
  }
});

router.patch('/plan/:id/annuler-fait', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const t = await prisma.planTache.findUnique({ where: { id: req.params.id }, include: { tache: { select: { nom: true } } } });
    if (!t) return sendError(res, 'Tâche introuvable', 404);
    if (t.statut !== 'FAIT' && t.statut !== 'REPRIS') return sendError(res, "Cette tâche n'est pas réglée", 400);
    const regle = await prisma.planTache.update({
      where: { id: t.id },
      data: { statut: 'A_FAIRE', faitParId: null, faitParNom: null, faitLe: null, points: null },
    });
    logAudit(req, { action: 'UPDATE', entity: 'PlanTache', entityId: t.id, description: `« Fait » ANNULÉ : « ${t.tache.nom} » (était ${t.points} pt à ${t.faitParNom})` });
    return sendSuccess(res, regle);
  } catch {
    return sendError(res, 'Erreur', 500);
  }
});

router.delete('/plan/:id', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const t = await prisma.planTache.findUnique({ where: { id: req.params.id }, include: { tache: { select: { nom: true } } } });
    if (!t) return sendError(res, 'Tâche introuvable', 404);
    await prisma.planTache.delete({ where: { id: t.id } });
    logAudit(req, {
      action: 'DELETE', entity: 'PlanTache', entityId: t.id,
      description: `Plan − « ${t.tache.nom} » (${t.assigneeNom}, échéance ${isoJour(t.dateLimite)}${t.points ? `, ${t.points} pt réglés` : ''}) supprimée`,
    });
    return sendSuccess(res, { message: 'Tâche retirée du plan' });
  } catch {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

// ==================== RÉCURRENTES ====================

router.get('/recurrentes', ...admin, async (_req: Request, res: Response): Promise<any> => {
  const recs = await prisma.tacheRecurrente.findMany({ include: { tache: { select: { nom: true, famille: true, mode: true } } }, orderBy: { createdAt: 'asc' } });
  return sendSuccess(res, recs);
});

const recSchema = z.object({
  tacheId: z.string().min(1),
  frequence: z.enum(['HEBDO', 'MENSUEL', 'TRIMESTRIEL']),
  jourSemaine: z.number().int().min(0).max(6).optional().nullable(),
  jourMois: z.number().int().min(1).max(28).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  alternance: z.boolean().optional().default(false),
  premierId: z.string().optional().nullable(),
  secondId: z.string().optional().nullable(),
  ancrage: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().max(300).optional().nullable(),
  actif: z.boolean().optional(),
});

router.post('/recurrentes', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = recSchema.parse(req.body);
    if (data.frequence === 'HEBDO' && data.jourSemaine == null) return sendError(res, 'Une récurrente hebdomadaire a besoin de son jour de semaine', 400);
    if (data.frequence !== 'HEBDO' && data.jourMois == null) return sendError(res, 'Indiquez le jour du mois (1-28)', 400);
    if (!data.alternance && !data.assigneeId) return sendError(res, 'Assignez la tâche à quelqu’un (ou activez l’alternance)', 400);
    if (data.alternance && (!data.premierId || !data.secondId)) return sendError(res, "L'alternance a besoin des deux associées (qui commence, qui suit)", 400);

    const rec = await prisma.tacheRecurrente.create({
      data: {
        tacheId: data.tacheId, frequence: data.frequence,
        jourSemaine: data.jourSemaine ?? null, jourMois: data.jourMois ?? null,
        assigneeId: data.alternance ? null : data.assigneeId,
        assigneeNom: data.alternance || !data.assigneeId ? null : await nomAssocie(data.assigneeId),
        alternance: data.alternance,
        premierId: data.premierId ?? null, premierNom: data.premierId ? await nomAssocie(data.premierId) : null,
        secondId: data.secondId ?? null, secondNom: data.secondId ? await nomAssocie(data.secondId) : null,
        ancrage: data.ancrage ? dateAMidi(data.ancrage) : null,
        note: data.note || null,
      },
      include: { tache: { select: { nom: true } } },
    });
    logAudit(req, {
      action: 'CREATE', entity: 'TacheRecurrente', entityId: rec.id,
      description: `Récurrente + « ${rec.tache.nom} » (${rec.frequence}${rec.alternance ? `, alternance ${rec.premierNom} → ${rec.secondNom}` : ` → ${rec.assigneeNom}`})`,
    });
    return sendSuccess(res, rec, 201);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, 'Erreur', 500);
  }
});

router.put('/recurrentes/:id', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = recSchema.partial().parse(req.body);
    const avant = await prisma.tacheRecurrente.findUnique({ where: { id: req.params.id }, include: { tache: { select: { nom: true } } } });
    if (!avant) return sendError(res, 'Récurrente introuvable', 404);
    const rec = await prisma.tacheRecurrente.update({
      where: { id: avant.id },
      data: {
        ...data,
        assigneeNom: data.assigneeId ? await nomAssocie(data.assigneeId) : undefined,
        premierNom: data.premierId ? await nomAssocie(data.premierId) : undefined,
        secondNom: data.secondId ? await nomAssocie(data.secondId) : undefined,
        ancrage: data.ancrage === undefined ? undefined : data.ancrage ? dateAMidi(data.ancrage) : null,
        note: data.note === undefined ? undefined : data.note || null,
      },
    });
    logAudit(req, { action: 'UPDATE', entity: 'TacheRecurrente', entityId: rec.id, description: `Récurrente « ${avant.tache.nom} » modifiée${data.actif === false ? ' — DÉSACTIVÉE' : ''}` });
    return sendSuccess(res, rec);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, 'Erreur', 500);
  }
});

router.delete('/recurrentes/:id', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const rec = await prisma.tacheRecurrente.findUnique({ where: { id: req.params.id }, include: { tache: { select: { nom: true } } } });
    if (!rec) return sendError(res, 'Récurrente introuvable', 404);
    await prisma.tacheRecurrente.delete({ where: { id: rec.id } });
    logAudit(req, { action: 'DELETE', entity: 'TacheRecurrente', entityId: rec.id, description: `Récurrente − « ${rec.tache.nom} » supprimée (les instances déjà générées restent au plan)` });
    return sendSuccess(res, { message: 'Récurrente supprimée' });
  } catch {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

// Génère les instances datées d'un mois depuis les récurrentes actives.
// Idempotent : la contrainte unique (recurrenteId, dateLimite) fait qu'un
// deuxième clic ne crée AUCUN doublon.
router.post('/recurrentes/generer', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const { annee, mois } = z.object({ annee: z.number().int().min(2024).max(2100), mois: z.number().int().min(1).max(12) }).parse(req.body);
    const recs = await prisma.tacheRecurrente.findMany({ where: { actif: true }, include: { tache: { select: { nom: true } } } });
    const dernierJour = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
    const finsDeTrimestre = new Set([11, 2, 5, 8]); // nov, fév, mai, août

    let crees = 0;
    for (const rec of recs) {
      const dates: Date[] = [];
      if (rec.frequence === 'HEBDO' && rec.jourSemaine != null) {
        for (let j = 1; j <= dernierJour; j++) {
          const d = new Date(Date.UTC(annee, mois - 1, j, 12));
          if (d.getUTCDay() === rec.jourSemaine) dates.push(d);
        }
      } else if (rec.frequence === 'MENSUEL' && rec.jourMois != null) {
        dates.push(new Date(Date.UTC(annee, mois - 1, Math.min(rec.jourMois, dernierJour), 12)));
      } else if (rec.frequence === 'TRIMESTRIEL' && rec.jourMois != null && finsDeTrimestre.has(mois)) {
        dates.push(new Date(Date.UTC(annee, mois - 1, Math.min(rec.jourMois, dernierJour), 12)));
      }

      for (const d of dates) {
        let assigneeId = rec.assigneeId, assigneeNom = rec.assigneeNom;
        if (rec.alternance && rec.premierId && rec.secondId) {
          const ancrage = rec.ancrage || new Date(Date.UTC(annee, mois - 1, 1, 12));
          const index = Math.floor((d.getTime() - ancrage.getTime()) / (7 * 86_400_000));
          const pair = ((index % 2) + 2) % 2 === 0;
          assigneeId = pair ? rec.premierId : rec.secondId;
          assigneeNom = pair ? rec.premierNom : rec.secondNom;
        }
        if (!assigneeId) continue;
        try {
          await prisma.planTache.create({
            data: {
              tacheId: rec.tacheId, recurrenteId: rec.id, dateLimite: d,
              assigneeId, assigneeNom: assigneeNom || (await nomAssocie(assigneeId)),
              note: rec.note || null,
            },
          });
          crees++;
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e; // P2002 = déjà générée : on passe
        }
      }
    }
    logAudit(req, { action: 'CREATE', entity: 'PlanTache', description: `Génération du plan ${annee}-${String(mois).padStart(2, '0')} : ${crees} tâche(s) récurrente(s) créée(s)` });
    return sendSuccess(res, { crees });
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, 'Erreur de génération', 500);
  }
});

// ==================== ACOMPTES ====================

router.get('/acomptes', ...admin, async (req: Request, res: Response): Promise<any> => {
  const { de, a } = req.query as Record<string, string>;
  const where: any = {};
  if (de || a) {
    where.date = {};
    if (de) where.date.gte = new Date(de + 'T00:00:00Z');
    if (a) where.date.lte = new Date(a + 'T23:59:59Z');
  }
  const acomptes = await prisma.acompteAssocie.findMany({ where, orderBy: { date: 'desc' }, take: 200 });
  return sendSuccess(res, acomptes);
});

router.post('/acomptes', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = z.object({
      userId: z.string().min(1),
      montant: z.number().positive().max(100_000),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      note: z.string().max(200).optional().nullable(),
    }).parse(req.body);
    const nom = await nomAssocie(data.userId);
    const ac = await prisma.acompteAssocie.create({
      data: { userId: data.userId, nom, montant: data.montant, date: dateAMidi(data.date), note: data.note || null },
    });
    logAudit(req, { action: 'CREATE', entity: 'AcompteAssocie', entityId: ac.id, description: `Acompte ${data.montant.toFixed(2)} $ → ${nom} (${data.date})` });
    return sendSuccess(res, ac, 201);
  } catch (e: any) {
    if (e instanceof z.ZodError) return sendError(res, 'Données invalides', 400, e.issues);
    return sendError(res, 'Erreur', 500);
  }
});

router.delete('/acomptes/:id', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const ac = await prisma.acompteAssocie.delete({ where: { id: req.params.id } });
    logAudit(req, { action: 'DELETE', entity: 'AcompteAssocie', entityId: ac.id, description: `Acompte supprimé : ${ac.montant.toFixed(2)} $ (${ac.nom})` });
    return sendSuccess(res, { message: 'Acompte supprimé' });
  } catch {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

// ==================== TABLEAUX ====================

// Le règlement d'un trimestre : points (auto + plan), ratios, bénéfice net,
// report (extinction 30 juin), parts, acomptes, soldes, drapeaux.
router.get('/trimestre', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const saison = parseInt(String(req.query.saison || ''), 10) || saisonCourante();
    const numero = Math.min(4, Math.max(1, parseInt(String(req.query.numero || ''), 10) || numeroTrimestreCourant()));
    const reglement = await reglementTrimestre(saison, numero as 1 | 2 | 3 | 4);
    return sendSuccess(res, reglement);
  } catch (e) {
    console.error('Erreur GET /gestion-temps/trimestre:', e);
    return sendError(res, 'Erreur du calcul du trimestre', 500);
  }
});

function numeroTrimestreCourant(): number {
  const [, m] = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date()).split('-').map(Number);
  if (m >= 9 && m <= 11) return 1;
  if (m === 12 || m <= 2) return 2;
  if (m >= 3 && m <= 5) return 3;
  return 4;
}

// Le détail des points automatiques d'une période (transparence totale).
router.get('/auto', ...admin, async (req: Request, res: Response): Promise<any> => {
  try {
    const { de, a } = req.query as Record<string, string>;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de || '') || !/^\d{4}-\d{2}-\d{2}$/.test(a || '')) {
      return sendError(res, 'Paramètres de et a requis (AAAA-MM-JJ)', 400);
    }
    return sendSuccess(res, await calculerPointsAuto(dateAMidi(de), dateAMidi(a)));
  } catch {
    return sendError(res, 'Erreur du calcul des points automatiques', 500);
  }
});

export default router;

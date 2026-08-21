import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { porteeStaff } from '../lib/portee';
import { logAudit } from '../lib/audit';
import { saisonCourante } from '../lib/saison';
import { z } from 'zod';

// Affiliations annuelles à la fédération (karaté, judo), par SAISON
// (1er septembre → 31 août). Le montant transite vers la fédération :
// ce n'est PAS un revenu du club — jamais compté dans rapports/dashboard.

const router = Router();

const affiliationSchema = z.object({
  membreId: z.string().min(1),
  discipline: z.enum(['KARATE', 'JUDO']),
  saison: z.string().regex(/^\d{4}-\d{4}$/, 'Format attendu : 2026-2027'),
  numero: z.string().optional().nullable(),
  montant: z.number().min(0).optional().nullable(),
  datePaiement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().optional().nullable(),
});

// GET /api/affiliations?saison=&discipline=&membreId=
// Staff : affiliations de sa discipline seulement.
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { saison, discipline, membreId } = req.query as Record<string, string>;
    const portee = await porteeStaff(req.user!);
    const where: any = {};
    if (!portee.admin) {
      if (portee.sports.length === 0) return sendSuccess(res, { saisonCourante: saisonCourante(), affiliations: [] });
      where.discipline = { in: portee.sports };
    }
    if (saison) where.saison = saison;
    if (discipline) where.discipline = discipline;
    if (membreId) where.membreId = membreId;
    const affiliations = await prisma.affiliation.findMany({
      where,
      orderBy: [{ saison: 'desc' }, { discipline: 'asc' }, { createdAt: 'asc' }],
      include: { member: { select: { id: true, firstName: true, lastName: true, status: true, sections: { select: { section: true } } } } },
    });
    return sendSuccess(res, { saisonCourante: saisonCourante(), affiliations });
  } catch {
    return sendError(res, 'Erreur de récupération des affiliations', 500);
  }
});

// POST /api/affiliations
router.post('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = affiliationSchema.parse(req.body);
    // Staff : uniquement des affiliations de sa discipline.
    const portee = await porteeStaff(req.user!);
    if (!portee.admin && !portee.sports.includes(data.discipline)) {
      return sendError(res, 'Vous ne pouvez affilier que dans votre discipline', 403);
    }
    const membre = await prisma.member.findUnique({ where: { id: data.membreId }, select: { firstName: true, lastName: true } });
    if (!membre) return sendError(res, 'Membre introuvable', 404);

    const affiliation = await prisma.affiliation.create({
      data: {
        ...data,
        datePaiement: data.datePaiement ? new Date(`${data.datePaiement}T12:00:00Z`) : null,
      },
    });
    logAudit(req, {
      action: 'CREATE',
      entity: 'Affiliation',
      entityId: affiliation.id,
      description: `Affiliation ${data.discipline} ${data.saison} : ${membre.firstName} ${membre.lastName}${data.montant ? ` — ${data.montant.toFixed(2)} $ (fédération)` : ''}`,
    });
    return sendSuccess(res, affiliation, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2002') return sendError(res, 'Ce membre est déjà affilié pour cette discipline et cette saison', 400);
    return sendError(res, "Erreur de création de l'affiliation", 500);
  }
});

// PUT /api/affiliations/:id
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = affiliationSchema.partial().parse(req.body);
    const portee = await porteeStaff(req.user!);
    if (!portee.admin) {
      const existante = await prisma.affiliation.findUnique({ where: { id: req.params.id } });
      if (!existante) return sendError(res, 'Affiliation introuvable', 404);
      if (!portee.sports.includes(existante.discipline) || (data.discipline && !portee.sports.includes(data.discipline))) {
        return sendError(res, 'Affiliation hors de votre discipline', 403);
      }
    }
    const updateData: any = { ...data };
    if (data.datePaiement !== undefined) {
      updateData.datePaiement = data.datePaiement ? new Date(`${data.datePaiement}T12:00:00Z`) : null;
    }
    const affiliation = await prisma.affiliation.update({ where: { id: req.params.id }, data: updateData });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'Affiliation',
      entityId: affiliation.id,
      description: `Affiliation modifiée : ${affiliation.discipline} ${affiliation.saison}`,
    });
    return sendSuccess(res, affiliation);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2025') return sendError(res, 'Affiliation introuvable', 404);
    if (error?.code === 'P2002') return sendError(res, 'Ce membre est déjà affilié pour cette discipline et cette saison', 400);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// DELETE /api/affiliations/:id
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const portee = await porteeStaff(req.user!);
    if (!portee.admin) {
      const existante = await prisma.affiliation.findUnique({ where: { id: req.params.id } });
      if (!existante) return sendError(res, 'Affiliation introuvable', 404);
      if (!portee.sports.includes(existante.discipline)) return sendError(res, 'Affiliation hors de votre discipline', 403);
    }
    const affiliation = await prisma.affiliation.delete({
      where: { id: req.params.id },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    logAudit(req, {
      action: 'DELETE',
      entity: 'Affiliation',
      entityId: affiliation.id,
      description: `Affiliation supprimée : ${affiliation.discipline} ${affiliation.saison} — ${affiliation.member.firstName} ${affiliation.member.lastName}`,
    });
    return sendSuccess(res, { message: 'Affiliation supprimée' });
  } catch (error: any) {
    if (error?.code === 'P2025') return sendError(res, 'Affiliation introuvable', 404);
    return sendError(res, 'Erreur de suppression', 500);
  }
});

export default router;

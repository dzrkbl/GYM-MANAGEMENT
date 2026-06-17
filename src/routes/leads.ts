import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';

const router = Router();

const STATUTS = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST'] as const;

const createSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  sport: z.string().optional().nullable(),
  requestType: z.enum(['ESSAI', 'RAPPEL', 'TARIFS', 'AUTRE']).optional().default('ESSAI'),
  website: z.string().optional().nullable(), // honeypot anti-spam
});

// POST /api/leads — création publique (formulaire « essai/rappel » du site)
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = createSchema.parse(req.body);
    if (data.website && data.website.trim() !== '') {
      return sendSuccess(res, { ok: true }); // honeypot : on ignore silencieusement
    }
    const lead = await prisma.lead.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender || null,
        phone: data.phone || null,
        email: data.email || null,
        sport: data.sport || 'AUTRE',
        requestType: data.requestType,
        status: 'NEW',
      },
    });
    return sendSuccess(res, { ok: true, id: lead.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, "Erreur lors de l'enregistrement de la demande", 500);
  }
});

// GET /api/leads?status=NEW — liste (ADMIN)
router.get('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const status = req.query.status as string | undefined;
    const where = status && (STATUTS as readonly string[]).includes(status) ? { status } : {};
    const leads = await prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' } });
    return sendSuccess(res, leads);
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération des prospects', 500);
  }
});

const updateSchema = z.object({
  status: z.enum(STATUTS).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  sport: z.string().optional().nullable(),
  requestType: z.enum(['ESSAI', 'RAPPEL', 'TARIFS', 'AUTRE']).optional(),
});

// PUT /api/leads/:id — mise à jour (statut, infos) (ADMIN)
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = updateSchema.parse(req.body);
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data });
    return sendSuccess(res, lead);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors de la mise à jour du prospect', 500);
  }
});

// POST /api/leads/:id/convert — convertir un prospect en membre EN_ATTENTE (ADMIN)
router.post('/:id/convert', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return sendError(res, 'Prospect introuvable', 404);

    const membre = await prisma.member.create({
      data: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        gender: lead.gender,
        phone: lead.phone,
        email: lead.email,
        status: 'EN_ATTENTE',
        notes: `Prospect converti — intérêt initial : ${lead.sport}`,
      },
    });

    await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED' } });

    logAudit(req, { action: 'CREATE', entity: 'Member', entityId: membre.id, description: `Conversion du prospect ${lead.firstName} ${lead.lastName}` });

    return sendSuccess(res, { membreId: membre.id }, 201);
  } catch (error) {
    return sendError(res, 'Erreur lors de la conversion', 500);
  }
});

// DELETE /api/leads/:id (ADMIN)
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    return sendSuccess(res, { ok: true });
  } catch (error) {
    return sendError(res, 'Erreur lors de la suppression du prospect', 500);
  }
});

export default router;

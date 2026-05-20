import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

const subscriptionSchema = z.object({
  memberId: z.string(),
  section: z.string(),
  type: z.enum(['MENSUEL', 'TRIMESTRIEL']),
  amount: z.number().positive(),
  startDate: z.string(),
  endDate: z.string(),
});

// GET /api/abonnements
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, section } = req.query;

    const subscriptions = await prisma.subscription.findMany({
      where: {
        ...(status ? { status: status as string } : {}),
        ...(section ? { section: section as string } : {}),
      },
      include: {
        member: { select: { firstName: true, lastName: true } }
      },
      orderBy: { endDate: 'asc' }
    });

    return sendSuccess(res, subscriptions);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des abonnements', 500);
  }
});

// POST /api/abonnements
router.post('/', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = subscriptionSchema.parse(req.body);

    const subscription = await prisma.subscription.create({
      data: {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      }
    });

    return sendSuccess(res, subscription, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(error.issues);
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur lors de la création de l\'abonnement', 500);
  }
});

// PUT /api/abonnements/:id
router.put('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { status } = z.object({ status: z.enum(['ACTIF', 'EXPIRÉ', 'ANNULÉ']) }).parse(req.body);

    const subscription = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status }
    });

    return sendSuccess(res, subscription);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Statut invalide', 400, error.issues);
    return sendError(res, 'Erreur lors de la mise à jour', 500);
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

const paymentSchema = z.object({
  subscriptionId: z.string().optional().nullable(),
  memberId: z.string(),
  amount: z.number().positive('Le montant doit être positif'),
  method: z.enum(['COMPTANT', 'VIREMENT', 'CARTE']).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  paidDate: z.string().optional().nullable(),
  status: z.enum(['PAYÉ', 'EN_ATTENTE', 'EN_RETARD']).default('EN_ATTENTE'),
});

// GET /api/paiements
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, section, month } = req.query;

    let whereClause: any = {};
    if (status) whereClause.status = status as string;
    
    // Pour filtrer par section, on passe par la relation avec le membre (ou l'abonnement si pertinent)
    if (section) {
      whereClause.subscription = { section: section as string };
    }

    if (month) {
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      whereClause.dueDate = { gte: startDate, lte: endDate };
    }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      include: {
        member: { select: { firstName: true, lastName: true } },
        subscription: true
      },
      orderBy: { dueDate: 'asc' }
    });

    return sendSuccess(res, payments);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des paiements', 500);
  }
});

// GET /api/paiements/retards
router.get('/retards', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    // Overdue payments: either explicitly marked OVERDUE or PENDING with dueDate past today
    const overdues = await prisma.payment.findMany({
      where: {
        status: { in: ['EN_ATTENTE', 'EN_RETARD'] },
        dueDate: { lt: new Date() }
      },
      include: {
        member: { select: { firstName: true, lastName: true, email: true, phone: true } }
      },
      orderBy: { dueDate: 'asc' }
    });

    const totalAmount = overdues.reduce((sum, p) => sum + p.amount, 0);

    return sendSuccess(res, { records: overdues, totalAmount });
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération des retards', 500);
  }
});

// POST /api/paiements
router.post('/', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = paymentSchema.parse(req.body);

    let finalDueDate = new Date();
    if (data.dueDate) {
      finalDueDate = new Date(data.dueDate);
    } else if (data.paidDate) {
      finalDueDate = new Date(data.paidDate);
    }

    const payment = await prisma.payment.create({
      data: {
        memberId: data.memberId,
        subscriptionId: data.subscriptionId,
        amount: data.amount,
        method: data.method,
        dueDate: finalDueDate,
        paidDate: data.paidDate ? new Date(data.paidDate) : null,
        status: data.status,
      }
    });

    return sendSuccess(res, payment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur d\'enregistrement', 500);
  }
});

// PUT /api/paiements/:id
router.put('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { status, paidDate, method } = req.body;

    let updateData: any = {};
    if (status) updateData.status = status;
    if (paidDate) updateData.paidDate = new Date(paidDate);
    if (method) updateData.method = method;

    const payment = await prisma.payment.update({
      where: { id },
      data: updateData
    });

    return sendSuccess(res, payment);
  } catch (error) {
    return sendError(res, 'Erreur de mise à jour du paiement', 500);
  }
});

export default router;

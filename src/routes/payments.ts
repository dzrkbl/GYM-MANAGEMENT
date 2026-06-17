import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { normalizeMethodePaiement } from '../lib/paiements';
import { sendRecuVersement } from '../lib/recus';
import { logAudit } from '../lib/audit';

const router = Router();

const paymentSchema = z.object({
  subscriptionId: z.string().optional().nullable(),
  memberId: z.string(),
  amount: z.number().positive('Le montant doit être positif'),
  method: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  paidDate: z.string().optional().nullable(),
  status: z.enum(['PAYÉ', 'EN_ATTENTE', 'EN_RETARD']).default('EN_ATTENTE'),
});

// GET /api/paiements
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, section, month } = req.query;
    const today = new Date();

    let whereClause: any = {};

    // Filtre par mois (sur datePrevue)
    if (month) {
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
      whereClause.datePrevue = { gte: startDate, lte: endDate };
    }

    // Filtre par section (via les sections du membre)
    if (section && section !== 'TOUS') {
      whereClause.member = {
        sections: { some: { section: section as string } }
      };
    }

    const versements = await prisma.paymentVersement.findMany({
      where: whereClause,
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            sections: { select: { section: true } }
          }
        }
      },
      orderBy: { datePrevue: 'asc' }
    });

    // Calculer le statut et mapper vers le format attendu par le frontend
    const mapped = versements.map(v => {
      let computedStatus: string;
      if (v.datePaiement) {
        computedStatus = 'PAYÉ';
      } else if (v.datePrevue && v.datePrevue < today) {
        computedStatus = 'EN_RETARD';
      } else {
        computedStatus = 'EN_ATTENTE';
      }

      return {
        id: v.id,
        amount: v.montant,
        montant: v.montant,
        status: computedStatus,
        dueDate: v.datePrevue,
        datePrevue: v.datePrevue,
        paidDate: v.datePaiement,
        datePaiement: v.datePaiement,
        methodePaiement: v.methodePaiement,
        numeroVersement: v.numeroVersement,
        note: v.note,
        createdAt: v.createdAt,
        member: v.member,
        memberId: v.membreId,
        section: v.member.sections?.[0]?.section || null
      };
    });

    // Filtre par statut après calcul (car le statut est dérivé, pas stocké)
    const filtered = status && status !== 'TOUS'
      ? mapped.filter(p => p.status === status)
      : mapped;

    return sendSuccess(res, filtered);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des paiements', 500);
  }
});

// GET /api/paiements/retards
router.get('/retards', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const today = new Date();
    // Overdue payments: non payés et datePrevue dépassée
    const overdues = await prisma.paymentVersement.findMany({
      where: {
        datePaiement: null,
        datePrevue: { lt: today }
      },
      include: {
        member: { select: { firstName: true, lastName: true, email: true, phone: true } }
      },
      orderBy: { datePrevue: 'asc' }
    });

    const totalAmount = overdues.reduce((sum, p) => sum + p.montant, 0);

    // Mappage vers le format attendu par le front
    const mapped = overdues.map(v => ({
      id: v.id,
      amount: v.montant,
      status: 'EN_RETARD',
      dueDate: v.datePrevue,
      member: v.member
    }));

    return sendSuccess(res, { records: mapped, totalAmount });
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération des retards', 500);
  }
});

/**
 * SOURCE OF TRUTH CLARIFICATION:
 * The `PaymentVersement` table is the active, single source of truth for all payment, installment, and late tracking operations.
 * The legacy `Payment` table is deprecated. All write routes (POST, PUT, PATCH) and read routes now point to `PaymentVersement`
 * to maintain consistent states, using the enum values of `MethodePaiement`: CASH, VIREMENT, CHEQUE, CARTE.
 */

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

    // Determine the next installment number for this member
    const currentCount = await prisma.paymentVersement.count({
      where: { membreId: data.memberId }
    });

    const methodEnum = normalizeMethodePaiement(data.method);

    const payment = await prisma.paymentVersement.create({
      data: {
        membreId: data.memberId,
        numeroVersement: currentCount + 1,
        montant: data.amount,
        datePrevue: finalDueDate,
        datePaiement: data.paidDate ? new Date(data.paidDate) : (data.status === 'PAYÉ' ? new Date() : null),
        methodePaiement: methodEnum,
        note: '',
      }
    });

    // Reçu automatique si le versement est créé déjà payé (sauf comptant).
    if (payment.datePaiement) {
      sendRecuVersement(payment.id).catch((e) => console.error('Erreur envoi reçu:', e));
    }

    logAudit(req, { action: 'CREATE', entity: 'PaymentVersement', entityId: payment.id, description: `Versement de ${data.amount} $` });

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
    const { status, paidDate, method, amount, note, dueDate } = req.body;

    let updateData: any = {};
    if (amount !== undefined) updateData.montant = amount;
    if (note !== undefined) updateData.note = note;
    if (dueDate) updateData.datePrevue = new Date(dueDate);

    if (paidDate !== undefined) {
      updateData.datePaiement = paidDate ? new Date(paidDate) : null;
    } else if (status === 'PAYÉ') {
      updateData.datePaiement = new Date();
    } else if (status === 'EN_ATTENTE' || status === 'EN_RETARD') {
      updateData.datePaiement = null;
    }

    if (method) {
      const normalized = normalizeMethodePaiement(String(method));
      if (normalized) updateData.methodePaiement = normalized;
    }

    const payment = await prisma.paymentVersement.update({
      where: { id },
      data: updateData
    });

    // Reçu automatique si le paiement vient d'être marqué payé (sauf comptant).
    if (updateData.datePaiement) {
      sendRecuVersement(id).catch((e) => console.error('Erreur envoi reçu:', e));
    }

    logAudit(req, { action: 'UPDATE', entity: 'PaymentVersement', entityId: id });

    return sendSuccess(res, payment);
  } catch (error) {
    return sendError(res, 'Erreur de mise à jour du paiement', 500);
  }
});

// PATCH /api/paiements/:id/payer
router.patch('/:id/payer', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { methodePaiement, note, datePaiement } = req.body;

    const methodEnum = normalizeMethodePaiement(methodePaiement) ?? 'CASH';

    const updated = await prisma.paymentVersement.update({
      where: { id },
      data: {
        datePaiement: datePaiement ? new Date(datePaiement) : new Date(),
        methodePaiement: methodEnum,
        note: note || ''
      }
    });

    // Reçu automatique (sauf comptant) — ne bloque pas la réponse.
    sendRecuVersement(id).catch((e) => console.error('Erreur envoi reçu:', e));

    logAudit(req, { action: 'PAY', entity: 'PaymentVersement', entityId: id });

    return sendSuccess(res, updated);
  } catch (error) {
    return sendError(res, 'Erreur lors du marquage du paiement', 500);
  }
});

export default router;

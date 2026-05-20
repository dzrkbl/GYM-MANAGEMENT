import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// PUT /api/versements/:id/payer
router.put('/:id/payer', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const schema = z.object({
      methodePaiement: z.enum(['CASH', 'VIREMENT', 'CHEQUE', 'CARTE']),
      datePaiement: z.string(), // YYYY-MM-DD
      note: z.string().optional().nullable(),
      montant: z.number().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const versement = await prisma.paymentVersement.update({
      where: { id },
      data: {
        datePaiement: new Date(data.datePaiement),
        methodePaiement: data.methodePaiement,
        note: data.note,
        ...(data.montant !== undefined && data.montant !== null ? { montant: data.montant } : {}),
      },
    });

    return sendSuccess(res, versement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur lors du règlement du versement', 500);
  }
});

export default router;

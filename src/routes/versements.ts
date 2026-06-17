import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { normalizeMethodePaiement } from '../lib/paiements';
import { sendRecuVersement } from '../lib/recus';
import { logAudit } from '../lib/audit';

const router = Router();

// PUT /api/versements/:id/payer
router.put('/:id/payer', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const schema = z.object({
      methodePaiement: z.string(),
      datePaiement: z.string(), // YYYY-MM-DD
      note: z.string().optional().nullable(),
      montant: z.number().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const methode = normalizeMethodePaiement(data.methodePaiement);
    if (!methode) {
      return sendError(res, 'Méthode de paiement invalide', 400);
    }

    const versement = await prisma.paymentVersement.update({
      where: { id },
      data: {
        datePaiement: new Date(data.datePaiement),
        methodePaiement: methode,
        note: data.note,
        ...(data.montant !== undefined && data.montant !== null ? { montant: data.montant } : {}),
      },
    });

    // Reçu automatique par courriel (sauf comptant) — ne bloque pas la réponse.
    sendRecuVersement(id).catch((e) => console.error('Erreur envoi reçu:', e));

    logAudit(req, { action: 'PAY', entity: 'PaymentVersement', entityId: id, description: `Versement réglé (${methode})` });

    return sendSuccess(res, versement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur lors du règlement du versement', 500);
  }
});

export default router;

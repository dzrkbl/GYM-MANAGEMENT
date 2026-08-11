import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { normalizeMethodePaiement, activerSiPremierPaiement } from '../lib/paiements';
import { sendRecuVersementBackground } from '../lib/recus';
import { dateAMidi, ajouterMoisISO } from '../lib/tarifs';
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

// Jour et mois courants à Montréal (le serveur tourne en UTC : après 20 h,
// « new Date() » est déjà demain — on compare donc des jours civils locaux).
function aujourdhuiMontreal(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
}

// GET /api/paiements
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, section, month } = req.query;
    const aujourdhui = aujourdhuiMontreal();           // AAAA-MM-JJ
    const moisCourant = aujourdhui.slice(0, 7);        // AAAA-MM

    let whereClause: any = {};

    // Filtre par mois : ce qui était DÛ ce mois-là OU ce qui a été PAYÉ ce
    // mois-là (avant, seul datePrevue comptait : un paiement encaissé en août
    // pour une échéance de juin était invisible dans la vue d'août).
    if (month) {
      const startDate = new Date(`${month}-01T00:00:00Z`);
      const debutMoisSuivant = new Date(`${ajouterMoisISO(`${month}-01`, 1)}T00:00:00Z`);
      const endDate = new Date(debutMoisSuivant.getTime() - 1);
      const dansLeMois: any[] = [
        { datePrevue: { gte: startDate, lte: endDate } },
        { datePaiement: { gte: startDate, lte: endDate } },
      ];
      // La vue du mois courant est la vue de travail : les impayés échus des
      // mois précédents y restent visibles au lieu d'être cachés par le filtre
      // (sauf ceux des membres INACTIF — les départs ne sont plus réclamés).
      if (String(month) === moisCourant) {
        dansLeMois.push({
          datePaiement: null,
          datePrevue: { lt: startDate },
          member: { status: { not: 'INACTIF' } },
        });
      }
      whereClause.OR = dansLeMois;
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
            status: true,
            sections: { select: { section: true } }
          }
        }
      },
      orderBy: { datePrevue: 'asc' }
    });

    // Calculer le statut et mapper vers le format attendu par le frontend.
    // « En retard » = le jour d'échéance est entièrement passé (comparaison de
    // jours civils, pas d'instants : une échéance du 15 n'est en retard que le 16).
    const mapped = versements.map(v => {
      let computedStatus: string;
      if (v.datePaiement) {
        computedStatus = 'PAYÉ';
      } else if (v.datePrevue && v.datePrevue.toISOString().slice(0, 10) < aujourdhui) {
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
    // Impayés dont le jour d'échéance est entièrement passé (jour civil de
    // Montréal) — les membres INACTIF (départs) sont exclus.
    const overdues = await prisma.paymentVersement.findMany({
      where: {
        datePaiement: null,
        datePrevue: { lt: new Date(aujourdhuiMontreal() + 'T00:00:00Z') },
        member: { status: { not: 'INACTIF' } }
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
        datePaiement: data.paidDate ? dateAMidi(data.paidDate) : (data.status === 'PAYÉ' ? new Date() : null),
        methodePaiement: methodEnum,
        note: '',
      }
    });

    // Reçu automatique si le versement est créé déjà payé (sauf comptant).
    if (payment.datePaiement) {
      await activerSiPremierPaiement(payment.membreId);
      sendRecuVersementBackground(payment.id);
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
      updateData.datePaiement = paidDate ? dateAMidi(paidDate) : null;
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
      await activerSiPremierPaiement(payment.membreId);
      sendRecuVersementBackground(id);
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
        datePaiement: datePaiement ? dateAMidi(datePaiement) : new Date(),
        methodePaiement: methodEnum,
        note: note || ''
      }
    });

    // Reçu automatique (sauf comptant) — ne bloque pas la réponse.
    await activerSiPremierPaiement(updated.membreId);
    sendRecuVersementBackground(id);

    logAudit(req, { action: 'PAY', entity: 'PaymentVersement', entityId: id });

    return sendSuccess(res, updated);
  } catch (error) {
    return sendError(res, 'Erreur lors du marquage du paiement', 500);
  }
});

export default router;

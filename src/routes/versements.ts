import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { normalizeMethodePaiement, activerSiPremierPaiement } from '../lib/paiements';
import { sendRecuVersementBackground } from '../lib/recus';
import { dateAMidi } from '../lib/tarifs';
import { logAudit } from '../lib/audit';

const router = Router();

// PATCH /api/versements/:id/frais-retard — gérer les frais de retard d'un
// versement. Décision financière : ADMIN seulement.
//   { exonerer: true|false }        → exonérer / rétablir le compteur automatique
//   { montantFacture: 10 }          → charger un montant CHOISI (remplace le
//                                     compteur : 4 semaines = 40 $ courus, on
//                                     peut ne charger que 10 $)
//   { montantFacture: null }        → revenir au compteur automatique
router.patch('/:id/frais-retard', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { exonerer, montantFacture } = z.object({
      exonerer: z.boolean().optional(),
      montantFacture: z.number().min(0).max(10_000).nullable().optional(),
    }).refine((d) => d.exonerer !== undefined || d.montantFacture !== undefined,
      { message: 'exonerer ou montantFacture requis' }).parse(req.body);

    const data: any = {};
    if (exonerer !== undefined) {
      data.exonererFraisRetard = exonerer;
      if (exonerer) data.fraisRetardFactures = null; // exonéré = aucun frais fixé
    }
    if (montantFacture !== undefined) {
      data.fraisRetardFactures = montantFacture;
      if (montantFacture !== null) data.exonererFraisRetard = false;
    }

    const versement = await prisma.paymentVersement.update({
      where: { id: req.params.id },
      data,
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    const quoi = exonerer !== undefined
      ? `Frais de retard ${exonerer ? 'EXONÉRÉS' : 'rétablis'}`
      : montantFacture === null
        ? 'Frais de retard remis au compteur automatique'
        : `Frais de retard fixés à ${montantFacture} $`;
    logAudit(req, {
      action: 'UPDATE',
      entity: 'PaymentVersement',
      entityId: versement.id,
      description: `${quoi} — ${versement.member.firstName} ${versement.member.lastName}, versement n°${versement.numeroVersement}`,
    });
    return sendSuccess(res, versement);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors de la modification des frais de retard', 500);
  }
});

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
        datePaiement: dateAMidi(data.datePaiement),
        methodePaiement: methode,
        note: data.note,
        ...(data.montant !== undefined && data.montant !== null ? { montant: data.montant } : {}),
      },
    });

    // Premier paiement d'un membre EN_ATTENTE : l'inscription est confirmée.
    const active = await activerSiPremierPaiement(versement.membreId);
    if (active) {
      logAudit(req, { action: 'UPDATE', entity: 'Member', entityId: versement.membreId, description: 'Activation automatique (premier paiement reçu)' });
    }

    // Reçu automatique par courriel (sauf comptant) — ne bloque pas la réponse.
    sendRecuVersementBackground(id);

    logAudit(req, { action: 'PAY', entity: 'PaymentVersement', entityId: id, description: `Versement réglé (${methode})` });

    return sendSuccess(res, versement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur lors du règlement du versement', 500);
  }
});

// PATCH /api/versements/:id/annuler-paiement — corrige une erreur d'encaissement :
// le versement redevient « à percevoir » (échéance et montant inchangés).
// receiptSentAt est effacé pour qu'un futur vrai paiement renvoie un reçu ;
// receiptNumber est conservé (continuité de la numérotation).
router.patch('/:id/annuler-paiement', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const existant = await prisma.paymentVersement.findUnique({
      where: { id: req.params.id },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    if (!existant) return sendError(res, 'Versement introuvable', 404);
    if (!existant.datePaiement) return sendError(res, "Ce versement n'est pas payé", 400);

    const versement = await prisma.paymentVersement.update({
      where: { id: existant.id },
      data: { datePaiement: null, methodePaiement: null, receiptSentAt: null },
    });

    logAudit(req, {
      action: 'UPDATE',
      entity: 'PaymentVersement',
      entityId: versement.id,
      description: `Paiement ANNULÉ (erreur d'encaissement) : versement #${existant.numeroVersement} de ${existant.montant.toFixed(2)} $ — ${existant.member.firstName} ${existant.member.lastName} (était payé le ${existant.datePaiement.toISOString().slice(0, 10)})`,
    });
    return sendSuccess(res, versement);
  } catch {
    return sendError(res, "Erreur lors de l'annulation du paiement", 500);
  }
});

// DELETE /api/versements/:id — supprime un versement (erreur de saisie, doublon).
// ⚠️ Un versement payé supprimé disparaît aussi des revenus des rapports —
// pour une simple erreur d'encaissement, utiliser « annuler-paiement ».
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const existant = await prisma.paymentVersement.findUnique({
      where: { id: req.params.id },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    if (!existant) return sendError(res, 'Versement introuvable', 404);

    await prisma.$transaction([
      // Nettoie les traces de rappels liées à ce versement (dédup obsolète).
      prisma.reminderLog.deleteMany({ where: { versementId: existant.id } }),
      prisma.paymentVersement.delete({ where: { id: existant.id } }),
    ]);

    logAudit(req, {
      action: 'DELETE',
      entity: 'PaymentVersement',
      entityId: existant.id,
      description: `Versement SUPPRIMÉ : #${existant.numeroVersement} de ${existant.montant.toFixed(2)} $ (${existant.datePaiement ? `PAYÉ le ${existant.datePaiement.toISOString().slice(0, 10)}` : `à percevoir le ${existant.datePrevue.toISOString().slice(0, 10)}`}) — ${existant.member.firstName} ${existant.member.lastName}`,
    });
    return sendSuccess(res, { message: 'Versement supprimé' });
  } catch {
    return sendError(res, 'Erreur lors de la suppression du versement', 500);
  }
});

// PATCH /api/versements/:id/reporter — déplace l'échéance d'un versement NON
// payé (entente avec le parent, correction d'un plan rétroactif). Le statut
// retard/à venir étant dérivé de la date, il se recalcule tout seul.
router.patch('/:id/reporter', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { datePrevue } = z.object({ datePrevue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)') }).parse(req.body);
    const existant = await prisma.paymentVersement.findUnique({
      where: { id: req.params.id },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    if (!existant) return sendError(res, 'Versement introuvable', 404);
    if (existant.datePaiement) return sendError(res, 'Ce versement est déjà payé — son échéance ne se déplace plus', 400);

    const versement = await prisma.paymentVersement.update({
      where: { id: existant.id },
      data: { datePrevue: dateAMidi(datePrevue) },
    });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'PaymentVersement',
      entityId: versement.id,
      description: `Échéance reportée : versement #${existant.numeroVersement} de ${existant.montant.toFixed(2)} $ — du ${existant.datePrevue.toISOString().slice(0, 10)} au ${datePrevue} — ${existant.member.firstName} ${existant.member.lastName}`,
    });
    return sendSuccess(res, versement);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, "Erreur lors du report de l'échéance", 500);
  }
});

export default router;

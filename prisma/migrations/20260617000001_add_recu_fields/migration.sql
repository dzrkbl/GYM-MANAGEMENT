-- Suivi des reçus de paiement (envoi automatique par courriel pour les paiements non-comptant)
ALTER TABLE "PaymentVersement" ADD COLUMN "receiptNumber" INTEGER;
ALTER TABLE "PaymentVersement" ADD COLUMN "receiptSentAt" TIMESTAMP(3);

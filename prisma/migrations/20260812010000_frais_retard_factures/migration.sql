-- Frais de retard réellement CHARGÉS par l'admin pour ce versement.
-- NULL = automatique (compteur couru : 10 $/semaine) ; un montant = décision
-- de l'admin (ex. 4 semaines de retard = 40 $ courus, mais on ne charge que
-- 10 $). Ce montant apparaît sur la facture annuelle et dans les rappels.
ALTER TABLE "PaymentVersement" ADD COLUMN "fraisRetardFactures" DOUBLE PRECISION;

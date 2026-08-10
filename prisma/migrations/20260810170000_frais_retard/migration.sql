-- Exonération des frais de retard au cas par cas (les frais eux-mêmes sont
-- calculés dynamiquement : 10 $/semaine après une semaine de retard).
ALTER TABLE "PaymentVersement" ADD COLUMN "exonererFraisRetard" BOOLEAN NOT NULL DEFAULT false;

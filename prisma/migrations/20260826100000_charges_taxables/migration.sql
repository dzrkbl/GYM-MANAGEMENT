-- Une charge porte-t-elle une taxe récupérable en crédit sur les intrants ?
-- Le club est inscrit aux fichiers TPS et TVQ : la part de taxe du loyer, de
-- l'électricité ou de la téléphonie lui revient. Les assurances (services
-- financiers) en sont exonérées, et les salaires ne portent aucune taxe.
ALTER TABLE "Depense" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DepenseConfig" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;

-- Amorçage : les assurances sont exonérées. Repérage par libellé, corrigeable
-- ensuite depuis l'interface — c'est une aide à la saisie, pas une vérité.
UPDATE "Depense" SET "taxable" = false WHERE "label" ILIKE '%assurance%';
UPDATE "DepenseConfig" SET "taxable" = false WHERE "label" ILIKE '%assurance%';

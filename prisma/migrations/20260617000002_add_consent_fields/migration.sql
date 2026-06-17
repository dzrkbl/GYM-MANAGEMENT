-- Consentement au règlement intérieur (preuve de signature à l'inscription en ligne)
ALTER TABLE "Member" ADD COLUMN "reglementVersion" TEXT;
ALTER TABLE "Member" ADD COLUMN "reglementAccepteAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "reglementSignataire" TEXT;

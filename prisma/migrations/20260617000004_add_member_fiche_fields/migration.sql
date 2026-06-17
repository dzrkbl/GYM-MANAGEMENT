-- Champs de la fiche d'inscription : adresse, santé et contact d'urgence
ALTER TABLE "Member" ADD COLUMN "adresse" TEXT;
ALTER TABLE "Member" ADD COLUMN "codePostal" TEXT;
ALTER TABLE "Member" ADD COLUMN "ville" TEXT;
ALTER TABLE "Member" ADD COLUMN "problemeSante" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Member" ADD COLUMN "noteSante" TEXT;
ALTER TABLE "Member" ADD COLUMN "urgenceNom" TEXT;
ALTER TABLE "Member" ADD COLUMN "urgenceLien" TEXT;
ALTER TABLE "Member" ADD COLUMN "urgenceTel" TEXT;

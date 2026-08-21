-- Lien prospect <-> fiche d'inscription en ligne : horodatage de la réception
-- de la fiche et dossier membre créé (badge « Fiche reçue » dans Prospects).
ALTER TABLE "Lead" ADD COLUMN "ficheRecueAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "membreId" TEXT;

-- Autorisations de la fiche d'inscription (droit à l'image, urgence médicale,
-- communications par courriel). Colonnes additives avec défaut : sans risque
-- pour les données existantes.
ALTER TABLE "Member" ADD COLUMN "consentPhoto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Member" ADD COLUMN "consentUrgence" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Member" ADD COLUMN "consentCommunications" BOOLEAN NOT NULL DEFAULT false;

-- Prospects : prochaine action et son échéance. Additif — la carte du
-- prospect affiche l'étape avec une alerte à l'approche de l'échéance,
-- l'onglet « À relancer » regroupe les échéances atteintes, et le tableau
-- de bord pointe dessus.
ALTER TABLE "Lead" ADD COLUMN "prochaineEtape" TEXT;
ALTER TABLE "Lead" ADD COLUMN "prochaineEcheance" TIMESTAMP(3);

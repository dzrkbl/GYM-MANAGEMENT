-- Motif de départ, saisi au passage d'un membre en INACTIF.
-- Nullable : les départs déjà enregistrés n'ont pas de motif, et en inventer
-- un serait faux. NULL se lit « non spécifié ».
ALTER TABLE "Member" ADD COLUMN "raisonDepart" TEXT;

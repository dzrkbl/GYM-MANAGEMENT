-- Section « Provenance » de la fiche d'inscription : qui a référé + canal de découverte.
ALTER TABLE "Member" ADD COLUMN "provenance" TEXT;
ALTER TABLE "Member" ADD COLUMN "refereParNom" TEXT;

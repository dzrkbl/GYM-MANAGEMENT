-- Module Inventaire : articles (coût d'achat interne + prix de vente parents)
-- et ventes tracées par membre. Module Événements : compétitions/passages de
-- grade avec inscriptions, et affiliations annuelles par discipline/saison.
CREATE TABLE "ArticleInventaire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "discipline" TEXT,
    "taille" TEXT,
    "couleur" TEXT,
    "marque" TEXT,
    "coutAchat" DOUBLE PRECISION,
    "prixVente" DOUBLE PRECISION NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 0,
    "seuilAlerte" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArticleInventaire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VenteEquipement" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "membreId" TEXT,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "prixUnitaire" DOUBLE PRECISION NOT NULL,
    "methode" "MethodePaiement",
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VenteEquipement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VenteEquipement_membreId_idx" ON "VenteEquipement"("membreId");
CREATE INDEX "VenteEquipement_date_idx" ON "VenteEquipement"("date");
ALTER TABLE "VenteEquipement" ADD CONSTRAINT "VenteEquipement_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "ArticleInventaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VenteEquipement" ADD CONSTRAINT "VenteEquipement_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Affiliation" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "saison" TEXT NOT NULL,
    "numero" TEXT,
    "montant" DOUBLE PRECISION,
    "datePaiement" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Affiliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Affiliation_membreId_discipline_saison_key" ON "Affiliation"("membreId", "discipline", "saison");
CREATE INDEX "Affiliation_saison_idx" ON "Affiliation"("saison");
ALTER TABLE "Affiliation" ADD CONSTRAINT "Affiliation_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Evenement" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COMPETITION',
    "discipline" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "lieu" TEXT,
    "fraisInscription" DOUBLE PRECISION,
    "note" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Evenement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvenementInscription" (
    "id" TEXT NOT NULL,
    "evenementId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "fraisPaye" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvenementInscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvenementInscription_evenementId_membreId_key" ON "EvenementInscription"("evenementId", "membreId");
ALTER TABLE "EvenementInscription" ADD CONSTRAINT "EvenementInscription_evenementId_fkey" FOREIGN KEY ("evenementId") REFERENCES "Evenement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvenementInscription" ADD CONSTRAINT "EvenementInscription_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

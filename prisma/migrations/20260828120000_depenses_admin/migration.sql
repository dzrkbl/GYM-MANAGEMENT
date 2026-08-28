-- Dépenses payées de leur poche par le personnel (facture photographiée,
-- OCR côté client) avec suivi du remboursement.
CREATE TABLE "DepenseAdmin" (
    "id" TEXT NOT NULL,
    "payeurId" TEXT NOT NULL,
    "payeurNom" TEXT NOT NULL,
    "fournisseur" TEXT,
    "dateFacture" TIMESTAMP(3) NOT NULL,
    "sousTotal" DOUBLE PRECISION,
    "tps" DOUBLE PRECISION,
    "tvq" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,
    "categorie" TEXT,
    "note" TEXT,
    "imageDataUrl" TEXT,
    "ocrBrut" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'A_REMBOURSER',
    "rembourseLe" TIMESTAMP(3),
    "rembourseVia" TEXT,
    "depenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DepenseAdmin_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DepenseAdmin_payeurId_idx" ON "DepenseAdmin"("payeurId");
CREATE INDEX "DepenseAdmin_statut_idx" ON "DepenseAdmin"("statut");

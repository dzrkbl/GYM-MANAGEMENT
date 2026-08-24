-- Calendrier de saison : dates de fédérations importées (.ics) et événements du club.

ALTER TABLE "Evenement" ADD COLUMN "dateFin" TIMESTAMP(3);
ALTER TABLE "Evenement" ADD COLUMN "horaire" TEXT;
ALTER TABLE "Evenement" ADD COLUMN "statut" TEXT NOT NULL DEFAULT 'RETENU';
ALTER TABLE "Evenement" ADD COLUMN "source" TEXT;
ALTER TABLE "Evenement" ADD COLUMN "sourceUid" TEXT;

-- Deux NULL ne se heurtent pas : les événements saisis au club ne sont pas contraints.
CREATE UNIQUE INDEX "Evenement_source_sourceUid_key" ON "Evenement"("source", "sourceUid");
CREATE INDEX "Evenement_date_idx" ON "Evenement"("date");

CREATE TABLE "CalendrierSource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "discipline" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dernierSyncAt" TIMESTAMP(3),
    "dernierSyncMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendrierSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendrierSource_code_key" ON "CalendrierSource"("code");

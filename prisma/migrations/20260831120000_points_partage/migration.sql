-- Module « Points & partage » : barème, plan de tâches, récurrentes, acomptes.

CREATE TABLE "TachePoints" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "famille" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "valeur" DOUBLE PRECISION NOT NULL,
    "supplement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preuve" TEXT NOT NULL,
    "note" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TachePoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TachePoints_code_key" ON "TachePoints"("code");
CREATE UNIQUE INDEX "TachePoints_nom_key" ON "TachePoints"("nom");

CREATE TABLE "PlanTache" (
    "id" TEXT NOT NULL,
    "tacheId" TEXT NOT NULL,
    "dateLimite" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "assigneeNom" TEXT NOT NULL,
    "quantite" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "duree" DOUBLE PRECISION,
    "statut" TEXT NOT NULL DEFAULT 'A_FAIRE',
    "faitParId" TEXT,
    "faitParNom" TEXT,
    "faitLe" TIMESTAMP(3),
    "points" DOUBLE PRECISION,
    "note" TEXT,
    "recurrenteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanTache_recurrenteId_dateLimite_key" ON "PlanTache"("recurrenteId", "dateLimite");
CREATE INDEX "PlanTache_statut_dateLimite_idx" ON "PlanTache"("statut", "dateLimite");
CREATE INDEX "PlanTache_faitLe_idx" ON "PlanTache"("faitLe");

CREATE TABLE "TacheRecurrente" (
    "id" TEXT NOT NULL,
    "tacheId" TEXT NOT NULL,
    "frequence" TEXT NOT NULL,
    "jourSemaine" INTEGER,
    "jourMois" INTEGER,
    "assigneeId" TEXT,
    "assigneeNom" TEXT,
    "alternance" BOOLEAN NOT NULL DEFAULT false,
    "premierId" TEXT,
    "premierNom" TEXT,
    "secondId" TEXT,
    "secondNom" TEXT,
    "ancrage" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TacheRecurrente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcompteAssocie" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcompteAssocie_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcompteAssocie_date_idx" ON "AcompteAssocie"("date");

ALTER TABLE "PlanTache" ADD CONSTRAINT "PlanTache_tacheId_fkey" FOREIGN KEY ("tacheId") REFERENCES "TachePoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanTache" ADD CONSTRAINT "PlanTache_recurrenteId_fkey" FOREIGN KEY ("recurrenteId") REFERENCES "TacheRecurrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TacheRecurrente" ADD CONSTRAINT "TacheRecurrente_tacheId_fkey" FOREIGN KEY ("tacheId") REFERENCES "TachePoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

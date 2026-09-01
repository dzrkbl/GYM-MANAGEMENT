-- Chantier « Heures & cours » (spécifications L3, étape 1) : fondations.
-- Tout est ADDITIF : colonnes nullables ou à défaut, tables neuves — aucun
-- sens existant ne change.

-- Course : capacités du local et drapeau stratégique (sort le cours du
-- verdict automatique de la page Rapports).
ALTER TABLE "Course" ADD COLUMN "capacite" INTEGER;
ALTER TABLE "Course" ADD COLUMN "capaciteDeuxCoachs" INTEGER;
ALTER TABLE "Course" ADD COLUMN "strategique" BOOLEAN NOT NULL DEFAULT false;

-- User : paie à l'heure ($/h net — les salaires ne portent pas de taxes).
-- Renseigné => paie du mois = séances tenues × durée × taux ; nul => la
-- rémunération forfaitaire existante s'applique telle quelle.
ALTER TABLE "User" ADD COLUMN "tauxHoraire" DOUBLE PRECISION;

-- CreneauLoue : une plage horaire louée à un tiers (ex. club Wing Tsun).
CREATE TABLE "CreneauLoue" (
    "id" TEXT NOT NULL,
    "locataire" TEXT NOT NULL,
    "jours" TEXT[],
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "tarifHoraire" DOUBLE PRECISION NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "note" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreneauLoue_pkey" PRIMARY KEY ("id")
);

-- RevenuLocation : encaissement mensuel d'un créneau loué (un seul par
-- créneau et par mois).
CREATE TABLE "RevenuLocation" (
    "id" TEXT NOT NULL,
    "creneauId" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "montantTTC" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenuLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenuLocation_creneauId_annee_mois_key" ON "RevenuLocation"("creneauId", "annee", "mois");

ALTER TABLE "RevenuLocation" ADD CONSTRAINT "RevenuLocation_creneauId_fkey" FOREIGN KEY ("creneauId") REFERENCES "CreneauLoue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ParametreRentabilite : singleton des réglages du modèle de coût, créé ici
-- même avec ses défauts (48 semaines, 15 $/h marginal ; heures ouvertes et
-- valeur de l'heure de proprio en automatique).
CREATE TABLE "ParametreRentabilite" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "heuresOuvertesSemaine" DOUBLE PRECISION,
    "semainesSaison" INTEGER NOT NULL DEFAULT 48,
    "coutMarginalHeure" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "valeurHeureProprio" DOUBLE PRECISION,
    "semainesAvantDedoublement" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParametreRentabilite_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ParametreRentabilite" ("id") VALUES (1) ON CONFLICT DO NOTHING;

-- Capacités actuelles du club, semées UNE FOIS (modifiables ensuite depuis
-- l'app) : 30 partout (karaté, judo, kickboxing), puis U8/ninjas 15 à un
-- entraîneur et 25 à deux. Les cours créés après cette migration naissent
-- sans capacité : la page Rapports le signale (avertissements) tant qu'elle
-- n'est pas renseignée.
UPDATE "Course" SET "capacite" = 30 WHERE "capacite" IS NULL;

UPDATE "Course" SET "capacite" = 15, "capaciteDeuxCoachs" = 25
WHERE "section" IN (
  SELECT "code" FROM "Section"
  WHERE lower(coalesce("sport", '')) LIKE '%ninja%'
     OR lower(coalesce("label", '')) LIKE '%ninja%'
     OR lower(coalesce("label", '')) LIKE '%u8%'
     OR lower("code") LIKE '%ninja%'
     OR lower("code") LIKE '%u8%'
);

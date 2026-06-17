-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('MENSUEL', 'TRIMESTRIEL', 'ANNUEL');

-- CreateEnum
CREATE TYPE "MethodePaiement" AS ENUM ('CASH', 'VIREMENT', 'CHEQUE', 'CARTE');

-- CreateEnum
CREATE TYPE "CategorieDepense" AS ENUM ('FIXE', 'VARIABLE', 'SALARIALE', 'AUTRE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "section" TEXT,
    "remuneration" DOUBLE PRECISION DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIF',
    "signupDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "parentName" TEXT,
    "parentPhone" TEXT,
    "parentEmail" TEXT,
    "currentBelt" TEXT DEFAULT 'BLANCHE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "poids" DOUBLE PRECISION,
    "adresse" TEXT,
    "codePostal" TEXT,
    "ville" TEXT,
    "problemeSante" BOOLEAN NOT NULL DEFAULT false,
    "noteSante" TEXT,
    "urgenceNom" TEXT,
    "urgenceLien" TEXT,
    "urgenceTel" TEXT,
    "dateInscription" TIMESTAMP(3),
    "finContrat" TIMESTAMP(3),
    "plan" "Plan",
    "prixBase" DOUBLE PRECISION,
    "rabaisFamille" BOOLEAN NOT NULL DEFAULT false,
    "membreFamilleId" TEXT,
    "rabaisCustomPct" DOUBLE PRECISION,
    "raisonRabaisCustom" TEXT,
    "montantFinal" DOUBLE PRECISION,
    "referePar" TEXT,
    "rabaisReferentPct" DOUBLE PRECISION,
    "rabaisReferentApplique" BOOLEAN NOT NULL DEFAULT false,
    "reglementVersion" TEXT,
    "reglementAccepteAt" TIMESTAMP(3),
    "reglementSignataire" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentVersement" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "numeroVersement" INTEGER NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "datePrevue" TIMESTAMP(3) NOT NULL,
    "datePaiement" TIMESTAMP(3),
    "methodePaiement" "MethodePaiement",
    "note" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "receiptNumber" INTEGER,
    "receiptSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentVersement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSection" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "belt" TEXT DEFAULT 'Blanche',
    "enrollmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "coachId" TEXT,
    "jours" TEXT[],
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "ceinturePrecedente" TEXT NOT NULL,
    "ceintureMontante" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "examinateurId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "sport" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasseSalariale" (
    "id" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasseSalariale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSalaire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachSalaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepenseConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "montantBase" DOUBLE PRECISION NOT NULL,
    "anneeBase" INTEGER NOT NULL,
    "tauxHaussePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepenseConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "mois" INTEGER,
    "annee" INTEGER NOT NULL,
    "categorie" "CategorieDepense" NOT NULL DEFAULT 'FIXE',
    "note" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "configCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userNom" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "versementId" TEXT,
    "refKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSection_memberId_section_key" ON "MemberSection"("memberId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_memberId_courseId_date_key" ON "Attendance"("memberId", "courseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Section_code_key" ON "Section"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MasseSalariale_mois_annee_key" ON "MasseSalariale"("mois", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "DepenseConfig_code_key" ON "DepenseConfig"("code");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ReminderLog_memberId_idx" ON "ReminderLog"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_type_refKey_key" ON "ReminderLog"("type", "refKey");

-- AddForeignKey
ALTER TABLE "PaymentVersement" ADD CONSTRAINT "PaymentVersement_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSection" ADD CONSTRAINT "MemberSection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_examinateurId_fkey" FOREIGN KEY ("examinateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


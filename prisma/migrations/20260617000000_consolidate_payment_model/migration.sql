-- Consolidation du modèle de données :
--   * suppression des tables legacy "Payment" et "Subscription" (remplacées par "PaymentVersement")
--   * suppression de l'enum "PaymentMethod" (on conserve "MethodePaiement")
--   * suppression de "Member.groupe" : la (les) section(s) d'un membre passent désormais
--     exclusivement par la table "MemberSection"
--   * ajout de "PaymentVersement.reminderSentAt" pour le suivi des rappels de paiement

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_memberId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_subscriptionId_fkey";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_memberId_fkey";

-- DropTable
DROP TABLE IF EXISTS "Payment";
DROP TABLE IF EXISTS "Subscription";

-- DropEnum
DROP TYPE IF EXISTS "PaymentMethod";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN IF EXISTS "groupe";

-- AlterTable
ALTER TABLE "PaymentVersement" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

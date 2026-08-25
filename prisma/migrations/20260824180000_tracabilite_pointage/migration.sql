-- Traçabilité du pointage : quand la saisie a eu lieu, et par qui.
-- Colonnes NULLABLES et SANS valeur par défaut : les pointages déjà en base
-- n'ont pas d'historique. Leur attribuer la date de la migration ferait croire
-- que tous les pointages passés ont été saisis le même jour. NULL = inconnu.
ALTER TABLE "Attendance" ADD COLUMN "pointeAt" TIMESTAMP(3);
ALTER TABLE "Attendance" ADD COLUMN "pointeParId" TEXT;
ALTER TABLE "Attendance" ADD COLUMN "pointeParNom" TEXT;

-- Le calendrier et la page Pointage interrogent toujours par (cours, date).
CREATE INDEX "Attendance_courseId_date_idx" ON "Attendance"("courseId", "date");

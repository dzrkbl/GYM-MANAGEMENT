-- Journal des rappels/alertes envoyés (déduplication des relances automatiques)
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
CREATE UNIQUE INDEX "ReminderLog_type_refKey_key" ON "ReminderLog"("type", "refKey");

-- CreateIndex
CREATE INDEX "ReminderLog_memberId_idx" ON "ReminderLog"("memberId");

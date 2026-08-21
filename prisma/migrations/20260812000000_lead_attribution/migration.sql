-- Attribution marketing des prospects (landing pages, pubs Meta)
ALTER TABLE "Lead" ADD COLUMN "source" TEXT;
ALTER TABLE "Lead" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "Lead" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "Lead" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "Lead" ADD COLUMN "note" TEXT;

ALTER TABLE "Community"
  ADD COLUMN "monetizationMode" TEXT NOT NULL DEFAULT 'hybrid',
  ADD COLUMN "activityWindowDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "CommunityMember"
  ADD COLUMN "freePublicationOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "freePublicationUntil" TIMESTAMP(3);

ALTER TABLE "Organization"
  ADD COLUMN "starsSubscriptionStatus" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "starsSubscriptionChargeId" TEXT,
  ADD COLUMN "starsSubscriptionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "starsSubscriptionPrice" INTEGER NOT NULL DEFAULT 500;

ALTER TABLE "PlatformSetting"
  ADD COLUMN "freeBoardSubscriptionStars" INTEGER NOT NULL DEFAULT 500;

CREATE UNIQUE INDEX "Organization_starsSubscriptionChargeId_key"
  ON "Organization"("starsSubscriptionChargeId");

UPDATE "PlatformSetting"
SET "defaultCommissionBps" = 1500,
    "freeBoardSubscriptionStars" = 500
WHERE "id" = 'global';

ALTER TABLE "Community"
  ADD CONSTRAINT "Community_monetizationMode_check"
  CHECK ("monetizationMode" IN ('paid_all', 'hybrid', 'free_subscription')),
  ADD CONSTRAINT "Community_activityWindowDays_check"
  CHECK ("activityWindowDays" BETWEEN 1 AND 365);

CREATE TABLE "DailyMessageActivity" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "totalMessageCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedMessageCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyMessageActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyMessageActivity_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyMessageActivity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyMessageActivity_communityId_userId_day_key"
  ON "DailyMessageActivity"("communityId", "userId", "day");
CREATE INDEX "DailyMessageActivity_communityId_userId_day_idx"
  ON "DailyMessageActivity"("communityId", "userId", "day");

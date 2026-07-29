ALTER TABLE "Organization"
  ALTER COLUMN "starsSubscriptionPrice" SET DEFAULT 3000;

ALTER TABLE "PlatformSetting"
  ALTER COLUMN "freeBoardSubscriptionStars" SET DEFAULT 3000;

UPDATE "PlatformSetting"
SET "freeBoardSubscriptionStars" = 3000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'global'
  AND "freeBoardSubscriptionStars" < 3000;

ALTER TABLE "Community"
  ALTER COLUMN "publicationPriceStars" SET DEFAULT 100;

ALTER TABLE "Organization"
  ALTER COLUMN "starsSubscriptionPrice" SET DEFAULT 750;

ALTER TABLE "PlatformSetting"
  ALTER COLUMN "minimumPublicationStars" SET DEFAULT 100,
  ALTER COLUMN "freeBoardSubscriptionStars" SET DEFAULT 750,
  ALTER COLUMN "minimumPayoutStars" SET DEFAULT 2500;

UPDATE "Community"
SET "publicationPriceStars" = 100
WHERE "publicationPriceStars" < 100;

UPDATE "Organization"
SET "starsSubscriptionPrice" = 750
WHERE "starsSubscriptionPrice" < 750
  AND "starsSubscriptionStatus" <> 'active';

UPDATE "PlatformSetting"
SET "minimumPublicationStars" = 100,
    "defaultCommissionBps" = 1500,
    "freeBoardSubscriptionStars" = 750,
    "starsHoldDays" = 21,
    "minimumPayoutStars" = 2500
WHERE "id" = 'global';

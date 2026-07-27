ALTER TABLE "PlatformSetting"
  ALTER COLUMN "platformName" SET DEFAULT 'Adnecta';

UPDATE "PlatformSetting"
SET "platformName" = 'Adnecta'
WHERE "platformName" = 'Community Board';

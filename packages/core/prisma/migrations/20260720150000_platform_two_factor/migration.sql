ALTER TABLE "User"
  ADD COLUMN "totpSecretEncrypted" TEXT,
  ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN "totpLastUsedStep" BIGINT,
  ADD COLUMN "backupCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

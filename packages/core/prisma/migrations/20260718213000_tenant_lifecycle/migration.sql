ALTER TABLE "Community"
  ADD COLUMN "disconnectedAt" TIMESTAMP(3),
  ADD COLUMN "botStatus" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "botIsAdministrator" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "botCanDeleteMessages" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "botCanRestrictMembers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "botCanInviteUsers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "botLastCheckedAt" TIMESTAMP(3);

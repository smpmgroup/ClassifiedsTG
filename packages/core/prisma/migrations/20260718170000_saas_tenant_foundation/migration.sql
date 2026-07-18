CREATE TYPE "PlatformRole" AS ENUM ('user', 'support', 'finance', 'platform_admin', 'platform_owner');
CREATE TYPE "OrganizationRole" AS ENUM ('member', 'administrator', 'owner');
CREATE TYPE "TenantStatus" AS ENUM ('onboarding', 'active', 'suspended', 'closed');

ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'user';
ALTER TABLE "Community"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "tenantStatus" "TenantStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN "connectedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3);

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "legalName" TEXT,
  "billingEmail" TEXT,
  "stripeCustomerId" TEXT,
  "stripeConnectAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMember" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSetting" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "platformName" TEXT NOT NULL DEFAULT 'Community Board',
  "minimumPublicationStars" INTEGER NOT NULL DEFAULT 10,
  "defaultCommissionBps" INTEGER NOT NULL DEFAULT 2500,
  "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "communityId" TEXT,
  "actorId" TEXT,
  "scope" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX "Organization_stripeConnectAccountId_key" ON "Organization"("stripeConnectAccountId");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX "OrganizationMember_userId_role_idx" ON "OrganizationMember"("userId", "role");
CREATE INDEX "Community_organizationId_tenantStatus_idx" ON "Community"("organizationId", "tenantStatus");
CREATE INDEX "AuditEvent_communityId_createdAt_idx" ON "AuditEvent"("communityId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX "AuditEvent_scope_action_createdAt_idx" ON "AuditEvent"("scope", "action", "createdAt");

ALTER TABLE "Community" ADD CONSTRAINT "Community_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Organization" ("id", "name", "slug", "updatedAt")
SELECT 'org_' || substr(md5("id"), 1, 24), "name", "slug", CURRENT_TIMESTAMP
FROM "Community";

UPDATE "Community"
SET "organizationId" = 'org_' || substr(md5("id"), 1, 24),
    "connectedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);

INSERT INTO "OrganizationMember" ("id", "organizationId", "userId", "role", "updatedAt")
SELECT 'om_' || substr(md5(cm."communityId" || cm."userId"), 1, 24),
       c."organizationId", cm."userId", 'owner', CURRENT_TIMESTAMP
FROM "CommunityMember" cm
JOIN "Community" c ON c."id" = cm."communityId"
WHERE cm."role" = 'owner'
ON CONFLICT ("organizationId", "userId") DO NOTHING;

INSERT INTO "PlatformSetting" ("id", "updatedAt") VALUES ('global', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "User"
SET "platformRole" = 'platform_owner'
WHERE "id" = (
  SELECT cm."userId"
  FROM "CommunityMember" cm
  WHERE cm."role" = 'owner'
  ORDER BY cm."createdAt" ASC
  LIMIT 1
);

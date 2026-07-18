CREATE TABLE "CommunityConnectionIntent" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedChatId" BIGINT,
  "communityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityConnectionIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityConnectionIntent_tokenHash_key" ON "CommunityConnectionIntent"("tokenHash");
CREATE INDEX "CommunityConnectionIntent_requestedById_status_expiresAt_idx" ON "CommunityConnectionIntent"("requestedById", "status", "expiresAt");
CREATE INDEX "CommunityConnectionIntent_organizationId_status_idx" ON "CommunityConnectionIntent"("organizationId", "status");

ALTER TABLE "CommunityConnectionIntent" ADD CONSTRAINT "CommunityConnectionIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityConnectionIntent" ADD CONSTRAINT "CommunityConnectionIntent_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

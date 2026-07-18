ALTER TABLE "Community"
  ADD COLUMN "abuseProtectionMode" TEXT NOT NULL DEFAULT 'enforce',
  ADD COLUMN "minQualifiedMessageChars" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "maxLinksPerQualifiedMessage" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maxListingsPerDay" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "duplicateWindowDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "duplicateSimilarityPercent" INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN "riskyListingThreshold" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "maxPaidInvoicesPerDay" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CommunityMember"
  ADD COLUMN "enforcementStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "restrictedUntil" TIMESTAMP(3),
  ADD COLUMN "enforcementReason" TEXT;
ALTER TABLE "Listing"
  ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "riskReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MessageActivity"
  ADD COLUMN "totalMessageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rejectedMessageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastMessageHash" TEXT,
  ADD COLUMN "lastMessageAt" TIMESTAMP(3);
UPDATE "MessageActivity" SET "totalMessageCount"="messageCount";
ALTER TABLE "PublicationPayment"
  ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "riskReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'clear';
CREATE TABLE "AbuseEvent" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "userId" TEXT,
  "listingId" TEXT,
  "paymentId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'medium',
  "score" INTEGER NOT NULL DEFAULT 0,
  "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolution" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AbuseEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AbuseEvent_communityId_status_createdAt_idx" ON "AbuseEvent"("communityId", "status", "createdAt");
CREATE INDEX "AbuseEvent_userId_createdAt_idx" ON "AbuseEvent"("userId", "createdAt");
CREATE INDEX "AbuseEvent_listingId_idx" ON "AbuseEvent"("listingId");
CREATE INDEX "AbuseEvent_paymentId_idx" ON "AbuseEvent"("paymentId");
ALTER TABLE "AbuseEvent" ADD CONSTRAINT "AbuseEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AbuseEvent" ADD CONSTRAINT "AbuseEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AbuseEvent" ADD CONSTRAINT "AbuseEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AbuseEvent" ADD CONSTRAINT "AbuseEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PublicationPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WebLoginIntent" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "userId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebLoginIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebLoginIntent_tokenHash_key" ON "WebLoginIntent"("tokenHash");
CREATE INDEX "WebLoginIntent_status_expiresAt_idx" ON "WebLoginIntent"("status", "expiresAt");
CREATE INDEX "WebLoginIntent_userId_createdAt_idx" ON "WebLoginIntent"("userId", "createdAt");

ALTER TABLE "WebLoginIntent"
  ADD CONSTRAINT "WebLoginIntent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

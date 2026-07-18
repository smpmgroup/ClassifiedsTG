CREATE TABLE "PayoutRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "amountStars" INTEGER NOT NULL,
  "settlementCurrency" TEXT NOT NULL DEFAULT 'EUR',
  "settlementAmount" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "rail" TEXT NOT NULL DEFAULT 'manual_sepa',
  "reservationTransactionId" TEXT,
  "completionTransactionId" TEXT,
  "stripeTransferId" TEXT,
  "externalReference" TEXT,
  "statementNote" TEXT,
  "failureReason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayoutRequest_reservationTransactionId_key" ON "PayoutRequest"("reservationTransactionId");
CREATE UNIQUE INDEX "PayoutRequest_completionTransactionId_key" ON "PayoutRequest"("completionTransactionId");
CREATE UNIQUE INDEX "PayoutRequest_stripeTransferId_key" ON "PayoutRequest"("stripeTransferId");
CREATE INDEX "PayoutRequest_organizationId_requestedAt_idx" ON "PayoutRequest"("organizationId", "requestedAt");
CREATE INDEX "PayoutRequest_status_requestedAt_idx" ON "PayoutRequest"("status", "requestedAt");
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_reservationTransactionId_fkey" FOREIGN KEY ("reservationTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_completionTransactionId_fkey" FOREIGN KEY ("completionTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

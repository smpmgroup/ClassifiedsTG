ALTER TABLE "PublicationPayment"
  ADD COLUMN "commissionBps" INTEGER NOT NULL DEFAULT 2500,
  ADD COLUMN "platformFeeStars" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "communityShareStars" INTEGER NOT NULL DEFAULT 0;

UPDATE "PublicationPayment"
SET "platformFeeStars" = (("amountStars" * "commissionBps" + 5000) / 10000),
    "communityShareStars" = "amountStars" - (("amountStars" * "commissionBps" + 5000) / 10000);

CREATE TABLE "LedgerAccount" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "organizationId" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'XTR',
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerTransaction" (
  "id" TEXT NOT NULL,
  "externalRef" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "organizationId" TEXT,
  "communityId" TEXT,
  "paymentId" TEXT,
  "grossAmount" INTEGER NOT NULL,
  "commissionBps" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerEntry" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LedgerEntry_amount_nonzero" CHECK ("amount" <> 0)
);

CREATE UNIQUE INDEX "LedgerAccount_key_key" ON "LedgerAccount"("key");
CREATE INDEX "LedgerAccount_organizationId_currency_kind_idx" ON "LedgerAccount"("organizationId", "currency", "kind");
CREATE UNIQUE INDEX "LedgerTransaction_externalRef_key" ON "LedgerTransaction"("externalRef");
CREATE INDEX "LedgerTransaction_organizationId_occurredAt_idx" ON "LedgerTransaction"("organizationId", "occurredAt");
CREATE INDEX "LedgerTransaction_communityId_occurredAt_idx" ON "LedgerTransaction"("communityId", "occurredAt");
CREATE INDEX "LedgerTransaction_paymentId_idx" ON "LedgerTransaction"("paymentId");
CREATE INDEX "LedgerTransaction_type_status_occurredAt_idx" ON "LedgerTransaction"("type", "status", "occurredAt");
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");

ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PublicationPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

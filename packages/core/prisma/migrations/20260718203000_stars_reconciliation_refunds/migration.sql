ALTER TABLE "PlatformSetting"
  ADD COLUMN "starsHoldDays" INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN "minimumPayoutStars" INTEGER NOT NULL DEFAULT 1000;

CREATE TABLE "TelegramStarObservation" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "telegramTransactionId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "nanostarAmount" INTEGER NOT NULL DEFAULT 0,
  "direction" TEXT NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "partnerType" TEXT,
  "invoicePayload" TEXT,
  "paymentId" TEXT,
  "raw" JSONB NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramStarObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramStarObservation_fingerprint_key" ON "TelegramStarObservation"("fingerprint");
CREATE INDEX "TelegramStarObservation_telegramTransactionId_idx" ON "TelegramStarObservation"("telegramTransactionId");
CREATE INDEX "TelegramStarObservation_paymentId_transactionDate_idx" ON "TelegramStarObservation"("paymentId", "transactionDate");
CREATE INDEX "TelegramStarObservation_direction_transactionDate_idx" ON "TelegramStarObservation"("direction", "transactionDate");

ALTER TABLE "TelegramStarObservation" ADD CONSTRAINT "TelegramStarObservation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PublicationPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

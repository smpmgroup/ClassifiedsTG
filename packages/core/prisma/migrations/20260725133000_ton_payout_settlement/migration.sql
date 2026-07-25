ALTER TABLE "PayoutRequest"
  ADD COLUMN "settlementTonNano" BIGINT,
  ADD COLUMN "tonTransactionHash" TEXT;

CREATE INDEX "PayoutRequest_tonTransactionHash_idx"
  ON "PayoutRequest"("tonTransactionHash");

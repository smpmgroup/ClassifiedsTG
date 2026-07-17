ALTER TABLE "Community" ADD COLUMN "minMonthlyMessagesForFree" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "publicationPriceStars" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "allowPaidNonMembers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Category" ADD COLUMN "fieldSchema" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Listing" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'not_required';
CREATE TABLE "MessageActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "communityId" TEXT NOT NULL REFERENCES "Community"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "month" TEXT NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageActivity_communityId_userId_month_key" UNIQUE ("communityId","userId","month")
);
CREATE TABLE "PublicationPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "communityId" TEXT NOT NULL REFERENCES "Community"("id"),
  "userId" TEXT NOT NULL REFERENCES "User"("id"),
  "listingId" TEXT NOT NULL UNIQUE REFERENCES "Listing"("id"),
  "amountStars" INTEGER NOT NULL,
  "invoicePayload" TEXT NOT NULL UNIQUE,
  "telegramPaymentChargeId" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3)
);

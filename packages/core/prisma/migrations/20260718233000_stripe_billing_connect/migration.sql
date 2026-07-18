ALTER TABLE "Organization"
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "subscriptionPlanKey" TEXT,
  ADD COLUMN "subscriptionPriceId" TEXT,
  ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "billingUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "connectDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connectRequirementsDue" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

CREATE TABLE "BillingPlan" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "stripePriceId" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "unitAmount" INTEGER NOT NULL DEFAULT 0,
  "interval" TEXT NOT NULL DEFAULT 'month',
  "features" JSONB NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingPlan_key_key" ON "BillingPlan"("key");
CREATE UNIQUE INDEX "BillingPlan_stripePriceId_key" ON "BillingPlan"("stripePriceId");

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StripeWebhookEvent_status_createdAt_idx" ON "StripeWebhookEvent"("status", "createdAt");
CREATE INDEX "StripeWebhookEvent_type_createdAt_idx" ON "StripeWebhookEvent"("type", "createdAt");

CREATE TABLE "StripeInvoiceRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "status" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "amountDue" INTEGER NOT NULL,
  "amountPaid" INTEGER NOT NULL,
  "hostedInvoiceUrl" TEXT,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeInvoiceRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StripeInvoiceRecord_organizationId_createdAt_idx" ON "StripeInvoiceRecord"("organizationId", "createdAt");
CREATE INDEX "StripeInvoiceRecord_subscriptionId_status_idx" ON "StripeInvoiceRecord"("subscriptionId", "status");
ALTER TABLE "StripeInvoiceRecord" ADD CONSTRAINT "StripeInvoiceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "BillingPlan" ("id", "key", "name", "description", "currency", "unitAmount", "interval", "features", "active", "sortOrder", "createdAt", "updatedAt") VALUES
  ('plan_starter', 'starter', 'Starter', 'Одна доска для небольшого сообщества', 'eur', 1900, 'month', '["1 сообщество", "Telegram Stars", "Модерация"]', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_pro', 'pro', 'Pro', 'Для растущих сетей сообществ', 'eur', 4900, 'month', '["5 сообществ", "Финансовые отчёты", "Приоритетная поддержка"]', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

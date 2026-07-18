import type { Prisma } from "@prisma/client";

export type StarsSplit = {
  grossStars: number;
  commissionBps: number;
  platformFeeStars: number;
  communityShareStars: number;
};

export function splitStarsCommission(
  grossStars: number,
  commissionBps: number,
): StarsSplit {
  if (!Number.isSafeInteger(grossStars) || grossStars <= 0)
    throw new Error("grossStars must be a positive integer");
  if (
    !Number.isSafeInteger(commissionBps) ||
    commissionBps < 0 ||
    commissionBps > 10_000
  )
    throw new Error("commissionBps must be between 0 and 10000");
  const platformFeeStars = Math.floor(
    (grossStars * commissionBps + 5_000) / 10_000,
  );
  return {
    grossStars,
    commissionBps,
    platformFeeStars,
    communityShareStars: grossStars - platformFeeStars,
  };
}

export function assertBalancedEntries(amounts: number[]) {
  if (!amounts.length || amounts.some((amount) => !Number.isSafeInteger(amount)))
    throw new Error("ledger entries must be integer amounts");
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total !== 0) throw new Error(`ledger transaction is not balanced: ${total}`);
}

type PaidPublicationLedgerInput = StarsSplit & {
  externalRef: string;
  organizationId: string;
  communityId: string;
  paymentId: string;
  telegramPaymentChargeId: string;
  occurredAt?: Date;
};

export async function recordPaidPublicationLedger(
  tx: Prisma.TransactionClient,
  input: PaidPublicationLedgerInput,
) {
  const existing = await tx.ledgerTransaction.findUnique({
    where: { externalRef: input.externalRef },
  });
  if (existing) return existing;
  if (
    input.platformFeeStars + input.communityShareStars !==
    input.grossStars
  )
    throw new Error("commission split does not equal gross Stars");
  const entryAmounts = [
    input.grossStars,
    -input.communityShareStars,
    -input.platformFeeStars,
  ].filter((amount) => amount !== 0);
  assertBalancedEntries(entryAmounts);
  const custody = await tx.ledgerAccount.upsert({
    where: { key: "platform:telegram-stars:pending" },
    update: {},
    create: {
      key: "platform:telegram-stars:pending",
      kind: "asset_pending",
      name: "Telegram Stars pending reward",
    },
  });
  const communityPayable = await tx.ledgerAccount.upsert({
    where: {
      key: `organization:${input.organizationId}:stars-payable:pending`,
    },
    update: {},
    create: {
      key: `organization:${input.organizationId}:stars-payable:pending`,
      organizationId: input.organizationId,
      kind: "liability_pending",
      name: "Community earnings pending",
    },
  });
  const commission = await tx.ledgerAccount.upsert({
    where: { key: "platform:stars-commission:pending" },
    update: {},
    create: {
      key: "platform:stars-commission:pending",
      kind: "revenue_pending",
      name: "Platform commission pending",
    },
  });
  return tx.ledgerTransaction.create({
    data: {
      externalRef: input.externalRef,
      type: "stars_publication_paid",
      status: "pending_settlement",
      organizationId: input.organizationId,
      communityId: input.communityId,
      paymentId: input.paymentId,
      grossAmount: input.grossStars,
      commissionBps: input.commissionBps,
      occurredAt: input.occurredAt || new Date(),
      metadata: {
        telegramPaymentChargeId: input.telegramPaymentChargeId,
        platformFeeStars: input.platformFeeStars,
        communityShareStars: input.communityShareStars,
      },
      entries: {
        create: [
          { accountId: custody.id, amount: input.grossStars },
          ...(input.communityShareStars
            ? [
                {
                  accountId: communityPayable.id,
                  amount: -input.communityShareStars,
                },
              ]
            : []),
          ...(input.platformFeeStars
            ? [
                {
                  accountId: commission.id,
                  amount: -input.platformFeeStars,
                },
              ]
            : []),
        ],
      },
    },
  });
}

export async function recordRefundLedger(
  tx: Prisma.TransactionClient,
  input: {
    originalExternalRef: string;
    refundExternalRef: string;
    reason: string;
    occurredAt?: Date;
  },
) {
  const existing = await tx.ledgerTransaction.findUnique({
    where: { externalRef: input.refundExternalRef },
  });
  if (existing) return existing;
  const original = await tx.ledgerTransaction.findUniqueOrThrow({
    where: { externalRef: input.originalExternalRef },
    include: { entries: true },
  });
  if (original.type !== "stars_publication_paid")
    throw new Error("only a paid publication journal can be refunded");
  const settlement = await tx.ledgerTransaction.findUnique({
    where: { externalRef: `stars-settlement:${original.id}` },
    include: { entries: true },
  });
  const reversedEntries = [
    ...original.entries,
    ...(settlement?.entries || []),
  ].map((entry) => ({ accountId: entry.accountId, amount: -entry.amount }));
  const amounts = reversedEntries.map((entry) => entry.amount);
  assertBalancedEntries(amounts);
  return tx.ledgerTransaction.create({
    data: {
      externalRef: input.refundExternalRef,
      type: "stars_publication_refunded",
      status: "completed",
      organizationId: original.organizationId,
      communityId: original.communityId,
      paymentId: original.paymentId,
      grossAmount: -original.grossAmount,
      commissionBps: original.commissionBps,
      occurredAt: input.occurredAt || new Date(),
      metadata: {
        reversalOf: original.id,
        settlementReversalOf: settlement?.id,
        reason: input.reason,
      },
      entries: {
        create: reversedEntries,
      },
    },
  });
}

export async function settlePaidPublicationLedger(
  tx: Prisma.TransactionClient,
  originalTransactionId: string,
  occurredAt = new Date(),
) {
  const original = await tx.ledgerTransaction.findUniqueOrThrow({
    where: { id: originalTransactionId },
    include: { payment: true },
  });
  if (
    original.type !== "stars_publication_paid" ||
    original.status !== "pending_settlement" ||
    !original.organizationId ||
    !original.payment ||
    original.payment.status !== "paid"
  )
    throw new Error("publication journal is not eligible for settlement");
  const externalRef = `stars-settlement:${original.id}`;
  const existing = await tx.ledgerTransaction.findUnique({
    where: { externalRef },
  });
  if (existing) return existing;
  const pendingAsset = await tx.ledgerAccount.findUniqueOrThrow({
    where: { key: "platform:telegram-stars:pending" },
  });
  const pendingPayable = await tx.ledgerAccount.findUniqueOrThrow({
    where: {
      key: `organization:${original.organizationId}:stars-payable:pending`,
    },
  });
  const pendingCommission = await tx.ledgerAccount.findUniqueOrThrow({
    where: { key: "platform:stars-commission:pending" },
  });
  const availableAsset = await tx.ledgerAccount.upsert({
    where: { key: "platform:telegram-stars:available" },
    update: {},
    create: {
      key: "platform:telegram-stars:available",
      kind: "asset_available",
      name: "Telegram Stars available reward",
    },
  });
  const availablePayable = await tx.ledgerAccount.upsert({
    where: {
      key: `organization:${original.organizationId}:stars-payable:available`,
    },
    update: {},
    create: {
      key: `organization:${original.organizationId}:stars-payable:available`,
      organizationId: original.organizationId,
      kind: "liability_available",
      name: "Community earnings available",
    },
  });
  const availableCommission = await tx.ledgerAccount.upsert({
    where: { key: "platform:stars-commission:available" },
    update: {},
    create: {
      key: "platform:stars-commission:available",
      kind: "revenue_available",
      name: "Platform commission available",
    },
  });
  const payment = original.payment;
  const entries = [
    { accountId: pendingAsset.id, amount: -payment.amountStars },
    { accountId: availableAsset.id, amount: payment.amountStars },
    ...(payment.communityShareStars
      ? [
          { accountId: pendingPayable.id, amount: payment.communityShareStars },
          {
            accountId: availablePayable.id,
            amount: -payment.communityShareStars,
          },
        ]
      : []),
    ...(payment.platformFeeStars
      ? [
          {
            accountId: pendingCommission.id,
            amount: payment.platformFeeStars,
          },
          {
            accountId: availableCommission.id,
            amount: -payment.platformFeeStars,
          },
        ]
      : []),
  ];
  assertBalancedEntries(entries.map((entry) => entry.amount));
  const settlement = await tx.ledgerTransaction.create({
    data: {
      externalRef,
      type: "stars_publication_settled",
      status: "completed",
      organizationId: original.organizationId,
      communityId: original.communityId,
      paymentId: original.paymentId,
      grossAmount: original.grossAmount,
      commissionBps: original.commissionBps,
      occurredAt,
      metadata: { settles: original.id },
      entries: { create: entries },
    },
  });
  await tx.ledgerTransaction.update({
    where: { id: original.id },
    data: { status: "settled" },
  });
  return settlement;
}

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

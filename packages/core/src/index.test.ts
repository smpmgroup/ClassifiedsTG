import { describe, expect, it } from "vitest";
import {
  assertListingTransition,
  expiresAt,
  jsonStringify,
  publicationAccess,
  splitStarsCommission,
  assertBalancedEntries,
  validateTaxonomyAttributes,
  qualifyCommunityMessage,
  tokenSimilarity,
  scoreListingRisk,
  scorePaymentRisk,
} from "./index.js";

describe("listing state machine", () => {
  it("allows required transitions", () =>
    expect(() => assertListingTransition("draft", "pending")).not.toThrow());
  it("rejects bypassing moderation", () =>
    expect(() => assertListingTransition("draft", "published")).toThrow(
      /not allowed/,
    ));
});

describe("abuse risk controls", () => {
  it("counts useful messages but rejects commands, short text, links and rapid copies", () => {
    expect(qualifyCommunityMessage({ text: "Полезный подробный ответ участнику", minChars: 12, maxLinks: 1 }).qualified).toBe(true);
    expect(qualifyCommunityMessage({ text: "/start", minChars: 12, maxLinks: 1 }).qualified).toBe(false);
    const first = qualifyCommunityMessage({ text: "Одинаковое сообщение для проверки", minChars: 12, maxLinks: 1 });
    expect(qualifyCommunityMessage({ text: "Одинаковое сообщение для проверки", minChars: 12, maxLinks: 1, lastHash: first.hash, lastAt: new Date(), now: new Date() }).reasons).toContain("rapid_duplicate");
  });
  it("detects similar listings and produces explainable bounded scores", () => {
    expect(tokenSimilarity("Продам красный городской велосипед", "Продам городской красный велосипед")).toBe(100);
    expect(scoreListingRisk({ title: "Продам", description: "запрещенный товар", prohibitedWords: ["запрещенный товар"], duplicateSimilarity: 90, accountAgeHours: 2 }).score).toBe(100);
    expect(scorePaymentRisk({ invoicesToday: 3, maxInvoicesPerDay: 3, listingRiskScore: 60, accountAgeHours: 2 })).toEqual({ score: 100, reasons: ["invoice_velocity", "risky_listing", "new_account"] });
  });
});

describe("Stars commission ledger", () => {
  it("uses deterministic integer rounding and preserves the gross amount", () => {
    expect(splitStarsCommission(50, 2500)).toEqual({
      grossStars: 50,
      commissionBps: 2500,
      platformFeeStars: 13,
      communityShareStars: 37,
    });
    expect(splitStarsCommission(10, 2500)).toMatchObject({
      platformFeeStars: 3,
      communityShareStars: 7,
    });
  });
  it("rejects invalid splits and unbalanced journal entries", () => {
    expect(() => splitStarsCommission(0, 2500)).toThrow();
    expect(() => splitStarsCommission(10, 10001)).toThrow();
    expect(() => assertBalancedEntries([50, -37, -13])).not.toThrow();
    expect(() => assertBalancedEntries([50, -37, -12])).toThrow(
      /not balanced/,
    );
  });
  it("balances settlement movements between pending and available", () => {
    expect(() =>
      assertBalancedEntries([-50, 50, 37, -37, 13, -13]),
    ).not.toThrow();
  });
  it("balances payout reservation, release and completion journals", () => {
    expect(() => assertBalancedEntries([-100, 100, 100, -100])).not.toThrow();
    expect(() => assertBalancedEntries([100, -100, -100, 100])).not.toThrow();
    expect(() => assertBalancedEntries([-100, 100])).not.toThrow();
  });
});

describe("expiration", () => {
  it("uses whole UTC days", () =>
    expect(expiresAt(3, new Date("2026-07-17T00:00:00Z")).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z",
    ));
});

describe("publication access", () => {
  it("is free for active members and moderators", () => {
    expect(publicationAccess("member", 10, 10, false)).toBe("free");
    expect(publicationAccess("moderator", 0, 10, false)).toBe("free");
  });
  it("requires and recognizes Stars payment below threshold", () => {
    expect(publicationAccess("member", 9, 10, false)).toBe("payment_required");
    expect(publicationAccess("member", 0, 10, true)).toBe("paid");
  });
});

describe("API serialization and taxonomy validation", () => {
  it("serializes Telegram bigint identifiers without losing precision", () => {
    expect(jsonStringify({ id: 9007199254740993123n })).toBe(
      '{"id":"9007199254740993123"}',
    );
  });
  it("reports missing, invalid select and out-of-range taxonomy values", () => {
    const schema = [
      {
        key: "kind",
        label: "Тип",
        type: "select",
        required: true,
        options: ["A", "B"],
      },
      { key: "year", label: "Год", type: "number", min: 1900, max: 2100 },
    ];
    expect(
      validateTaxonomyAttributes(schema, { kind: "C", year: 1800 }),
    ).toEqual(["Тип", "Год"]);
    expect(
      validateTaxonomyAttributes(schema, { kind: "A", year: 2026 }),
    ).toEqual([]);
  });
});

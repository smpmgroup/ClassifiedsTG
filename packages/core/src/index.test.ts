import { describe, expect, it } from "vitest";
import {
  assertListingTransition,
  expiresAt,
  jsonStringify,
  publicationAccess,
  validateTaxonomyAttributes,
} from "./index.js";

describe("listing state machine", () => {
  it("allows required transitions", () =>
    expect(() => assertListingTransition("draft", "pending")).not.toThrow());
  it("rejects bypassing moderation", () =>
    expect(() => assertListingTransition("draft", "published")).toThrow(
      /not allowed/,
    ));
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

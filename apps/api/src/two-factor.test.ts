import { describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, generateBackupCodes, hashBackupCode, totpAt, verifyBackupCode, verifyTotp } from "./two-factor.js";

describe("platform two-factor authentication", () => {
  it("matches the RFC 6238 SHA1 test vector", () => {
    expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1)).toBe("287082");
  });

  it("accepts a nearby TOTP step and rejects malformed codes", () => {
    const now = 1_700_000_000_000;
    const code = totpAt("JBSWY3DPEHPK3PXP", Math.floor(now / 30_000));
    expect(verifyTotp("JBSWY3DPEHPK3PXP", code, now)).toBe(Math.floor(now / 30_000));
    expect(verifyTotp("JBSWY3DPEHPK3PXP", "123", now)).toBeNull();
  });

  it("encrypts secrets with authenticated encryption", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", "x".repeat(32));
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret(encrypted, "x".repeat(32))).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decryptTotpSecret(`${encrypted}x`, "x".repeat(32))).toThrow();
  });

  it("creates one-time backup code hashes", () => {
    const codes = generateBackupCodes();
    const hashes = codes.map((code) => hashBackupCode(code, "x".repeat(32)));
    expect(new Set(codes).size).toBe(10);
    expect(verifyBackupCode(codes[3].toLowerCase(), hashes, "x".repeat(32))).toBe(3);
    expect(verifyBackupCode("WRONG-CODE", hashes, "x".repeat(32))).toBe(-1);
  });
});

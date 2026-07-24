import crypto from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(input: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of input.toUpperCase().replace(/=|\s|-/g, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function totpAt(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return number.toString().padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    const expected = Buffer.from(totpAt(secret, step));
    const supplied = Buffer.from(code);
    if (expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied))
      return step;
  }
  return null;
}

function encryptionKey(masterSecret: string) {
  return crypto.createHash("sha256").update(`classifiedstg:totp:${masterSecret}`).digest();
}

export function encryptTotpSecret(secret: string, masterSecret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(masterSecret), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptTotpSecret(value: string, masterSecret: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted TOTP secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(masterSecret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function generateBackupCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5)}`;
  });
}

export function normalizeBackupCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashBackupCode(value: string, masterSecret: string) {
  return crypto.createHmac("sha256", masterSecret).update(`backup:${normalizeBackupCode(value)}`).digest("hex");
}

export function verifyBackupCode(value: string, hashes: string[], masterSecret: string) {
  const candidate = Buffer.from(hashBackupCode(value, masterSecret));
  return hashes.findIndex((hash) => {
    const stored = Buffer.from(hash);
    return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
  });
}

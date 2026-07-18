import crypto from "node:crypto";

export const normalizeRiskText = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/https?:\/\/\S+|t\.me\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

export const textFingerprint = (value: string) =>
  crypto.createHash("sha256").update(normalizeRiskText(value)).digest("hex");

const linkCount = (value: string) =>
  (value.match(/(?:https?:\/\/|www\.|t\.me\/)/gi) || []).length;

export function qualifyCommunityMessage(input: {
  text: string;
  minChars: number;
  maxLinks: number;
  lastHash?: string | null;
  lastAt?: Date | null;
  now?: Date;
}) {
  const now = input.now || new Date();
  const normalized = normalizeRiskText(input.text);
  const hash = textFingerprint(input.text);
  const reasons: string[] = [];
  if (input.text.trim().startsWith("/")) reasons.push("command");
  if (normalized.replace(/\s/g, "").length < input.minChars) reasons.push("too_short");
  if (linkCount(input.text) > input.maxLinks) reasons.push("too_many_links");
  if (new Set(normalized.replace(/\s/g, "")).size < 4) reasons.push("low_information");
  if (input.lastHash === hash && input.lastAt && now.getTime() - input.lastAt.getTime() < 5 * 60_000)
    reasons.push("rapid_duplicate");
  return { qualified: reasons.length === 0, reasons, hash, normalizedLength: normalized.length };
}

export function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalizeRiskText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeRiskText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return Math.round((intersection / (a.size + b.size - intersection)) * 100);
}

export function scoreListingRisk(input: {
  title: string;
  description: string;
  prohibitedWords: string[];
  duplicateSimilarity: number;
  accountAgeHours: number;
  links?: number;
}) {
  const text = normalizeRiskText(`${input.title} ${input.description}`);
  const reasons: string[] = [];
  let score = 0;
  const matched = input.prohibitedWords.filter((word) => {
    const normalized = normalizeRiskText(word);
    return normalized.length >= 2 && text.includes(normalized);
  });
  if (matched.length) { score += 70; reasons.push("prohibited_content"); }
  if (input.duplicateSimilarity >= 85) { score += 45; reasons.push("probable_duplicate"); }
  else if (input.duplicateSimilarity >= 70) { score += 20; reasons.push("similar_listing"); }
  if (input.accountAgeHours < 24) { score += 15; reasons.push("new_account"); }
  if ((input.links || 0) > 2) { score += 20; reasons.push("many_external_links"); }
  if (new Set(text.replace(/\s/g, "")).size < 8) { score += 15; reasons.push("low_information"); }
  return { score: Math.min(score, 100), reasons, prohibitedMatches: matched };
}

export function scorePaymentRisk(input: {
  invoicesToday: number;
  maxInvoicesPerDay: number;
  listingRiskScore: number;
  accountAgeHours: number;
}) {
  let score = 0;
  const reasons: string[] = [];
  if (input.invoicesToday >= input.maxInvoicesPerDay) { score += 65; reasons.push("invoice_velocity"); }
  if (input.listingRiskScore >= 50) { score += 35; reasons.push("risky_listing"); }
  if (input.accountAgeHours < 24) { score += 15; reasons.push("new_account"); }
  return { score: Math.min(score, 100), reasons };
}

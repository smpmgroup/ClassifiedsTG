import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@board/core";
import { totpAt } from "./two-factor.js";

const baseUrl = process.env.BETA_AUDIT_BASE_URL || "http://127.0.0.1:3001";
const secret = process.env.ACCESS_TOKEN_SECRET || "";
if (!secret) throw new Error("ACCESS_TOKEN_SECRET is required");

const stamp = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const communityIds: string[] = [];
const organizationIds: string[] = [];
const userIds: string[] = [];
const webLoginIntentIds: string[] = [];
const uploadKeys: string[] = [];
const checks: string[] = [];

function token(payload: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ ...payload, iat: now, exp: now + 900 })}`;
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function request(path: string, accessToken: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

function expectStatus(name: string, actual: number, expected: number | number[]) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(actual)) throw new Error(`${name}: expected ${accepted.join("/")}, got ${actual}`);
  checks.push(name);
}

async function cleanup() {
  await Promise.all(uploadKeys.map((key) => fs.unlink(path.join(process.env.UPLOAD_DIR || "/app/uploads", path.basename(key))).catch(() => undefined)));
  if (communityIds.length) {
    const where = { communityId: { in: communityIds } };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where }),
      prisma.moderationAction.deleteMany({ where }),
      prisma.abuseEvent.deleteMany({ where }),
      prisma.report.deleteMany({ where }),
      prisma.messageActivity.deleteMany({ where }),
    ]);
    await prisma.listing.deleteMany({ where });
    await prisma.category.deleteMany({ where });
    await prisma.communityMember.deleteMany({ where });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
  }
  if (organizationIds.length) {
    await prisma.organizationMember.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  }
  if (webLoginIntentIds.length) await prisma.webLoginIntent.deleteMany({ where: { id: { in: webLoginIntentIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

try {
  const telegramBase = BigInt(`8${String(Date.now()).slice(-12)}`);
  const [shared, moderator, seller, ownerB, platformStaff] = await Promise.all([
    prisma.user.create({ data: { telegramUserId: telegramBase, firstName: `Beta shared ${stamp}` } }),
    prisma.user.create({ data: { telegramUserId: telegramBase + 1n, firstName: `Beta moderator ${stamp}` } }),
    prisma.user.create({ data: { telegramUserId: telegramBase + 2n, firstName: `Beta seller ${stamp}` } }),
    prisma.user.create({ data: { telegramUserId: telegramBase + 3n, firstName: `Beta owner B ${stamp}` } }),
    prisma.user.create({ data: { telegramUserId: telegramBase + 4n, firstName: `Beta platform staff ${stamp}`, platformRole: "platform_admin" } }),
  ]);
  userIds.push(shared.id, moderator.id, seller.id, ownerB.id, platformStaff.id);
  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({ data: { name: `Beta A ${stamp}`, slug: `beta-a-${stamp}`, members: { create: { userId: moderator.id, role: "owner" } } } }),
    prisma.organization.create({ data: { name: `Beta B ${stamp}`, slug: `beta-b-${stamp}`, members: { create: { userId: ownerB.id, role: "owner" } } } }),
  ]);
  organizationIds.push(orgA.id, orgB.id);
  const [communityA, communityB] = await Promise.all([
    prisma.community.create({ data: { telegramChatId: -(telegramBase + 100n), name: `Beta community A ${stamp}`, slug: `beta-community-a-${stamp}`, inviteUrl: "https://t.me/beta_a", organizationId: orgA.id, minMonthlyMessagesForFree: 2 } }),
    prisma.community.create({ data: { telegramChatId: -(telegramBase + 200n), name: `Beta community B ${stamp}`, slug: `beta-community-b-${stamp}`, inviteUrl: "https://t.me/beta_b", organizationId: orgB.id } }),
  ]);
  communityIds.push(communityA.id, communityB.id);
  const [categoryA, categoryB] = await Promise.all([
    prisma.category.create({ data: { communityId: communityA.id, name: "Beta goods A", slug: `goods-a-${stamp}`, fieldSchema: [] } }),
    prisma.category.create({ data: { communityId: communityB.id, name: "Beta goods B", slug: `goods-b-${stamp}`, fieldSchema: [] } }),
  ]);
  await prisma.communityMember.createMany({ data: [
    { communityId: communityA.id, userId: shared.id, role: "member", telegramMembershipStatus: "member" },
    { communityId: communityB.id, userId: shared.id, role: "member", telegramMembershipStatus: "member" },
    { communityId: communityA.id, userId: moderator.id, role: "owner", telegramMembershipStatus: "creator" },
    { communityId: communityB.id, userId: ownerB.id, role: "owner", telegramMembershipStatus: "creator" },
    { communityId: communityA.id, userId: seller.id, role: "member", telegramMembershipStatus: "member" },
    { communityId: communityB.id, userId: seller.id, role: "member", telegramMembershipStatus: "member" },
  ] });
  await prisma.messageActivity.create({ data: { communityId: communityA.id, userId: shared.id, month: new Date().toISOString().slice(0, 7), messageCount: 10, totalMessageCount: 10 } });
  const listingData = { title: `Beta listing ${stamp}`, description: "Complete beta acceptance listing", price: 25, locationText: "Tarragona" };
  const [draftA, draftB, publishedA, publishedB, pendingB] = await Promise.all([
    prisma.listing.create({ data: { ...listingData, communityId: communityA.id, authorId: shared.id, categoryId: categoryA.id } }),
    prisma.listing.create({ data: { ...listingData, title: `Protected B ${stamp}`, communityId: communityB.id, authorId: shared.id, categoryId: categoryB.id } }),
    prisma.listing.create({ data: { ...listingData, title: `Published A ${stamp}`, communityId: communityA.id, authorId: seller.id, categoryId: categoryA.id, status: "published", publishedAt: new Date() } }),
    prisma.listing.create({ data: { ...listingData, title: `Published B ${stamp}`, communityId: communityB.id, authorId: seller.id, categoryId: categoryB.id, status: "published", publishedAt: new Date() } }),
    prisma.listing.create({ data: { ...listingData, title: `Pending B ${stamp}`, communityId: communityB.id, authorId: seller.id, categoryId: categoryB.id, status: "pending" } }),
  ]);
  const fileA = `beta-${stamp}-a.webp`;
  const fileB = `beta-${stamp}-b.webp`;
  uploadKeys.push(fileA, fileB);
  await Promise.all([
    fs.writeFile(path.join(process.env.UPLOAD_DIR || "/app/uploads", fileA), Buffer.from("beta-a")),
    fs.writeFile(path.join(process.env.UPLOAD_DIR || "/app/uploads", fileB), Buffer.from("beta-b")),
  ]);
  const [imageA, imageB] = await Promise.all([
    prisma.listingImage.create({ data: { listingId: draftA.id, storageProvider: "local", storageKey: fileA, url: `/uploads/${fileA}` } }),
    prisma.listingImage.create({ data: { listingId: draftB.id, storageProvider: "local", storageKey: fileB, url: `/uploads/${fileB}` } }),
  ]);
  await prisma.favorite.createMany({ data: [
    { userId: shared.id, listingId: publishedA.id },
    { userId: shared.id, listingId: publishedB.id },
  ] });

  const memberA = token({ userId: shared.id, communityId: communityA.id, role: "member", telegramUserId: String(shared.telegramUserId) });
  const memberB = token({ userId: shared.id, communityId: communityB.id, role: "member", telegramUserId: String(shared.telegramUserId) });
  const moderatorA = token({ userId: moderator.id, communityId: communityA.id, role: "owner", telegramUserId: String(moderator.telegramUserId) });
  const platformA = token({ scope: "platform", userId: moderator.id, telegramUserId: String(moderator.telegramUserId), platformRole: "user" });
  const platformStaffUnverified = token({ scope: "platform", userId: platformStaff.id, telegramUserId: String(platformStaff.telegramUserId), platformRole: "platform_admin", mfa: false });

  const webStart = await request("/api/auth/platform/web/start", "", { method: "POST", body: "{}" });
  expectStatus("website starts Telegram registration", webStart.status, 200);
  if (!/^[A-Za-z0-9_-]{43}$/.test(webStart.body.token) || !String(webStart.body.botUrl).includes(`?start=login_${webStart.body.token}`))
    throw new Error("web login did not return a valid bot confirmation link");
  checks.push("website login returns a ten-minute Telegram deep link");
  const webTokenHash = crypto.createHash("sha256").update(webStart.body.token).digest("hex");
  const webIntent = await prisma.webLoginIntent.findUniqueOrThrow({ where: { tokenHash: webTokenHash } });
  webLoginIntentIds.push(webIntent.id);
  const claimedWebLogin = await prisma.webLoginIntent.updateMany({
    where: { id: webIntent.id, status: "pending", expiresAt: { gt: new Date() } },
    data: { status: "claimed", userId: moderator.id, claimedAt: new Date() },
  });
  if (claimedWebLogin.count !== 1) throw new Error("web login could not be claimed");
  const duplicateClaim = await prisma.webLoginIntent.updateMany({
    where: { id: webIntent.id, status: "pending", expiresAt: { gt: new Date() } },
    data: { status: "claimed", userId: ownerB.id, claimedAt: new Date() },
  });
  if (duplicateClaim.count !== 0) throw new Error("web login could be claimed by a second user");
  checks.push("Telegram confirmation is atomically single-claim");
  const webComplete = await request("/api/auth/platform/web/status", "", { method: "POST", body: JSON.stringify({ token: webStart.body.token }) });
  expectStatus("website exchanges Telegram confirmation", webComplete.status, 200);
  if (webComplete.body.status !== "complete" || !webComplete.body.accessToken) throw new Error("website login did not issue a platform session");
  expectStatus("website session opens owner dashboard", (await request("/api/platform/me", webComplete.body.accessToken)).status, 200);
  const webRetry = await request("/api/auth/platform/web/status", "", { method: "POST", body: JSON.stringify({ token: webStart.body.token }) });
  expectStatus("website exchange tolerates response retry", webRetry.status, 200);
  if (webRetry.body.accessToken !== webComplete.body.accessToken) throw new Error("web login retry was not idempotent");
  checks.push("website login retry returns the same short-lived session");

  const own = await request("/api/my/listings", memberA);
  expectStatus("tenant A own-listings request", own.status, 200);
  if (!own.body.some((item: any) => item.id === draftA.id) || own.body.some((item: any) => item.id === draftB.id)) throw new Error("own listings crossed tenant boundary");
  checks.push("own listings are tenant isolated");
  const favorites = await request("/api/my/favorites", memberA);
  expectStatus("tenant A favorites request", favorites.status, 200);
  if (favorites.body.length !== 1 || favorites.body[0].listing.id !== publishedA.id) throw new Error("favorites crossed tenant boundary");
  checks.push("favorites are tenant isolated");
  const detail = await request(`/api/listings/${draftA.id}`, memberA);
  expectStatus("authorized listing media metadata", detail.status, 200);
  const protectedUrl = detail.body.images?.[0]?.url;
  if (typeof protectedUrl !== "string" || !protectedUrl.startsWith(`/api/media/${imageA.id}?token=`) || "storageKey" in detail.body.images[0])
    throw new Error("listing image did not receive a sanitized signed URL");
  expectStatus("signed image delivery", (await request(protectedUrl, memberA)).status, 200);
  const tampered = new URL(protectedUrl, baseUrl);
  const signedValue = tampered.searchParams.get("token") || "";
  tampered.searchParams.set("token", `${signedValue.slice(0, -1)}${signedValue.endsWith("a") ? "b" : "a"}`);
  const tamperedResponse = await fetch(tampered);
  expectStatus("tampered image token denied", tamperedResponse.status, 401);
  expectStatus("legacy upload path denied", (await fetch(`${baseUrl}/uploads/${fileA}`)).status, 404);

  expectStatus("cross-tenant edit denied", (await request(`/api/listings/${draftB.id}`, memberA, { method: "PATCH", body: JSON.stringify({ title: "MUTATED" }) })).status, 404);
  expectStatus("cross-tenant transition denied", (await request(`/api/listings/${draftB.id}/transition`, memberA, { method: "POST", body: JSON.stringify({ status: "pending" }) })).status, 404);
  expectStatus("cross-tenant payment denied", (await request(`/api/listings/${draftB.id}/payment-link`, memberA, { method: "POST" })).status, 404);
  expectStatus("cross-tenant upload denied", (await request(`/api/listings/${draftB.id}/images`, memberA, { method: "POST", body: new FormData() })).status, 409);
  expectStatus("cross-tenant image delete denied", (await request(`/api/listings/${draftB.id}/images/${imageB.id}`, memberA, { method: "DELETE" })).status, 404);
  const unchanged = await prisma.listing.findUniqueOrThrow({ where: { id: draftB.id } });
  if (unchanged.title === "MUTATED") throw new Error("cross-tenant listing was mutated");
  checks.push("cross-tenant mutation left data unchanged");

  expectStatus("member cannot open admin dashboard", (await request("/api/admin/dashboard", memberA)).status, 403);
  const moderationBefore = await request("/api/admin/moderation", moderatorA);
  expectStatus("moderator queue request", moderationBefore.status, 200);
  if (moderationBefore.body.some((item: any) => item.id === pendingB.id)) throw new Error("moderation queue crossed tenant boundary");
  checks.push("moderation queue is tenant isolated");

  expectStatus("free active member submits listing", (await request(`/api/listings/${draftA.id}/transition`, memberA, { method: "POST", body: JSON.stringify({ status: "pending" }) })).status, 200);
  expectStatus("tenant moderator publishes listing", (await request(`/api/admin/listings/${draftA.id}/transition`, moderatorA, { method: "POST", body: JSON.stringify({ status: "published" }) })).status, 200);
  const board = await request("/api/listings", memberA);
  expectStatus("tenant board request", board.status, 200);
  if (!board.body.some((item: any) => item.id === draftA.id) || board.body.some((item: any) => item.id === publishedB.id)) throw new Error("published board crossed tenant boundary");
  checks.push("publish and board flow remains tenant isolated");

  expectStatus("organization finance denied across tenant", (await request(`/api/platform/organizations/${orgB.id}/finance`, platformA)).status, 403);
  expectStatus("ordinary platform user denied owner console", (await request("/api/platform/admin/reliability", platformA)).status, 403);

  const supportTicket = await prisma.supportTicket.create({ data: {
    organizationId: orgA.id, communityId: communityA.id, createdById: moderator.id,
    subject: `Beta protected support ${stamp}`,
  }});
  expectStatus("privileged platform session requires 2FA setup", (await request("/api/platform/admin/reliability", platformStaffUnverified)).status, 428);
  expectStatus("unverified platform staff cannot bypass tenant support", (await request(`/api/platform/support/${supportTicket.id}/messages`, platformStaffUnverified, { method: "POST", body: JSON.stringify({ message: "must not be written", internal: true }) })).status, 403);
  const twoFactorSetup = await request("/api/platform/security/two-factor/setup", platformStaffUnverified, { method: "POST", body: "{}" });
  expectStatus("privileged user starts encrypted 2FA setup", twoFactorSetup.status, 200);
  const setupCode = totpAt(twoFactorSetup.body.secret);
  const twoFactorConfirm = await request("/api/platform/security/two-factor/confirm", platformStaffUnverified, { method: "POST", body: JSON.stringify({ code: setupCode }) });
  expectStatus("privileged user confirms TOTP", twoFactorConfirm.status, 200);
  if (!Array.isArray(twoFactorConfirm.body.backupCodes) || twoFactorConfirm.body.backupCodes.length !== 10) throw new Error("2FA backup codes were not issued exactly once");
  checks.push("2FA issued ten one-time backup codes");
  expectStatus("MFA-verified platform session reaches owner console", (await request("/api/platform/admin/reliability", twoFactorConfirm.body.accessToken)).status, 200);
  expectStatus("MFA-verified support bypass succeeds", (await request(`/api/platform/support/${supportTicket.id}/messages`, twoFactorConfirm.body.accessToken, { method: "POST", body: JSON.stringify({ message: "verified internal note", internal: true }) })).status, 200);
  const staffWebStart = await request("/api/auth/platform/web/start", "", { method: "POST", body: "{}" });
  expectStatus("privileged website login starts", staffWebStart.status, 200);
  const staffWebIntent = await prisma.webLoginIntent.findUniqueOrThrow({
    where: { tokenHash: crypto.createHash("sha256").update(staffWebStart.body.token).digest("hex") },
  });
  webLoginIntentIds.push(staffWebIntent.id);
  await prisma.webLoginIntent.update({ where: { id: staffWebIntent.id }, data: {
    status: "claimed", userId: platformStaff.id, claimedAt: new Date(),
  }});
  const staffWebStatus = await request("/api/auth/platform/web/status", "", { method: "POST", body: JSON.stringify({ token: staffWebStart.body.token }) });
  expectStatus("privileged website login requests second factor", staffWebStatus.status, 200);
  if (!staffWebStatus.body.requiresTwoFactor || !staffWebStatus.body.challengeToken) throw new Error("privileged web login bypassed 2FA");
  const staffWebMfa = await request("/api/auth/platform/two-factor", "", { method: "POST", body: JSON.stringify({
    challengeToken: staffWebStatus.body.challengeToken,
    code: twoFactorConfirm.body.backupCodes[1],
  }) });
  expectStatus("privileged website login completes with recovery code", staffWebMfa.status, 200);
  const challenge = token({ scope: "platform_2fa", userId: platformStaff.id, nonce: `beta-${stamp}` });
  expectStatus("used TOTP step cannot be replayed", (await request("/api/auth/platform/two-factor", platformStaffUnverified, { method: "POST", body: JSON.stringify({ challengeToken: challenge, code: setupCode }) })).status, 401);
  const backupChallenge = token({ scope: "platform_2fa", userId: platformStaff.id, nonce: `beta-backup-${stamp}` });
  const backupLogin = await request("/api/auth/platform/two-factor", platformStaffUnverified, { method: "POST", body: JSON.stringify({ challengeToken: backupChallenge, code: twoFactorConfirm.body.backupCodes[0] }) });
  expectStatus("backup code completes privileged login", backupLogin.status, 200);
  expectStatus("2FA challenge cannot be replayed", (await request("/api/auth/platform/two-factor", platformStaffUnverified, { method: "POST", body: JSON.stringify({ challengeToken: backupChallenge, code: twoFactorConfirm.body.backupCodes[0] }) })).status, 401);

  await prisma.community.update({ where: { id: communityB.id }, data: { tenantStatus: "suspended" } });
  expectStatus("suspended tenant denied", (await request("/api/me", memberB)).status, 403);
  expectStatus("unrelated tenant survives suspension", (await request("/api/me", memberA)).status, 200);
  await prisma.community.update({ where: { id: communityB.id }, data: { tenantStatus: "active" } });
  await prisma.communityMember.update({ where: { communityId_userId: { communityId: communityB.id, userId: shared.id } }, data: { enforcementStatus: "banned", enforcementReason: "beta isolation probe" } });
  expectStatus("tenant-local ban enforced", (await request("/api/me", memberB)).status, 403);
  expectStatus("tenant-local ban does not leak", (await request("/api/me", memberA)).status, 200);

  console.log(JSON.stringify({ ok: true, checks: checks.length, stamp, baseUrl }));
} finally {
  await cleanup();
  await prisma.$disconnect();
}

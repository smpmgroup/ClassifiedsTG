import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Redis } from "ioredis";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import Stripe from "stripe";
import { fileTypeFromBuffer } from "file-type";
import {
  prisma,
  DomainError,
  privilegedRoles,
  adminRoles,
  assertListingTransition,
  expiresAt,
  validateTaxonomyAttributes,
  jsonStringify,
  splitStarsCommission,
  recordRefundLedger,
  settlePaidPublicationLedger,
  reservePayoutLedger,
  releasePayoutLedger,
  completePayoutLedger,
  tokenSimilarity,
  scoreListingRisk,
  scorePaymentRisk,
} from "@board/core";
import { loadConfig } from "./config.js";
import { telegramMembership, validateInitData } from "./auth.js";

const config = loadConfig();
const stripe = config.STRIPE_SECRET_KEY
  ? new Stripe(config.STRIPE_SECRET_KEY)
  : null;
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "body.initData",
    ],
  },
  bodyLimit: 1024 * 1024,
});
app.setReplySerializer(jsonStringify);
await app.register(helmet);
await app.register(cors, {
  origin: config.NODE_ENV === "production" ? config.APP_URL : true,
});
await app.register(rateLimit, { max: 100, timeWindow: "1 minute", redis });
await app.register(jwt, { secret: config.ACCESS_TOKEN_SECRET });
function protectImageUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(protectImageUrls);
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype)
    return value;
  const item = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(item)) {
    if (["storageKey", "telegramFileId", "telegramFileUniqueId"].includes(key) && "storageProvider" in item && "listingId" in item)
      continue;
    output[key] = protectImageUrls(child);
  }
  if ("storageProvider" in item && "listingId" in item && typeof item.id === "string") {
    const mediaToken = app.jwt.sign({ scope: "media", imageId: item.id }, { expiresIn: 3600 });
    output.url = `/api/media/${item.id}?token=${encodeURIComponent(mediaToken)}`;
  }
  return output;
}
app.addHook("preSerialization", async (_req, _reply, payload) => protectImageUrls(payload));
await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: false,
  runFirst: true,
});
await app.register(multipart, {
  limits: {
    fileSize: config.MAX_IMAGE_SIZE_MB * 1024 * 1024,
    files: config.MAX_LISTING_IMAGES,
  },
});
await app.register(swagger, {
  openapi: { info: { title: "Community Board API", version: "2.0.0" } },
});
await app.register(swaggerUi, { routePrefix: "/docs" });
await fs.mkdir(config.UPLOAD_DIR, { recursive: true });

type Identity = {
  userId: string;
  communityId: string;
  role: "member" | "moderator" | "admin" | "owner";
  telegramUserId: string;
};
type PlatformIdentity = {
  userId: string;
  telegramUserId: string;
  platformRole: "user" | "support" | "finance" | "platform_admin" | "platform_owner";
};
declare module "fastify" {
  interface FastifyRequest {
    identity?: Identity;
    platformIdentity?: PlatformIdentity;
  }
}
async function platformAuth(req: any, reply: any) {
  try {
    const decoded = (await req.jwtVerify()) as PlatformIdentity & {
      scope?: string;
    };
    if (decoded.scope !== "platform" || !decoded.userId)
      throw new Error("invalid platform session");
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        telegramUserId: true,
        status: true,
        platformRole: true,
      },
    });
    if (!user || user.status !== "active")
      throw new DomainError("ACCESS_DENIED", "Доступ ограничен", 403);
    req.platformIdentity = {
      userId: user.id,
      telegramUserId: String(user.telegramUserId),
      platformRole: user.platformRole,
    };
  } catch (e) {
    if (e instanceof DomainError) throw e;
    return reply.status(401).send(error("UNAUTHORIZED", "Требуется вход"));
  }
}
const requirePlatformRole = (roles: Set<string>) =>
  async (req: any, reply: any) => {
    await platformAuth(req, reply);
    if (reply.sent) return;
    if (!roles.has(req.platformIdentity.platformRole))
      return reply.status(403).send(error("FORBIDDEN", "Недостаточно прав"));
  };
const platformAdminRoles = new Set(["platform_admin", "platform_owner"]);
const platformFinanceRoles = new Set([
  "finance",
  "platform_admin",
  "platform_owner",
]);
const platformSupportRoles = new Set([
  "support",
  "platform_admin",
  "platform_owner",
]);
const error = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});

async function telegramBotApi<T>(method: string, body: Record<string, unknown>) {
  const response = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };
  if (!response.ok || !payload.ok)
    throw new DomainError(
      "TELEGRAM_API_ERROR",
      payload.description || `Telegram ${method} failed`,
      502,
    );
  return payload.result as T;
}

function requireStripe() {
  if (!stripe)
    throw new DomainError(
      "STRIPE_NOT_CONFIGURED",
      "Stripe ещё не подключён владельцем платформы",
      503,
    );
  return stripe;
}

async function organizationPlatformMembership(
  organizationId: string,
  userId: string,
  roles: string[] = ["owner", "administrator"],
) {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
  if (!membership || !roles.includes(membership.role))
    throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
  return membership;
}

const stripeObjectId = (value: unknown) =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && "id" in value
      ? String((value as any).id)
      : null;

async function syncStripeSubscription(subscription: any) {
  const customerId = stripeObjectId(subscription.customer);
  const organizationId = String(subscription.metadata?.organizationId || "");
  const organization = organizationId
    ? await prisma.organization.findUnique({ where: { id: organizationId } })
    : customerId
      ? await prisma.organization.findUnique({
          where: { stripeCustomerId: customerId },
        })
      : null;
  if (!organization) return null;
  const item = subscription.items?.data?.[0];
  const priceId = stripeObjectId(item?.price);
  const plan = priceId
    ? await prisma.billingPlan.findUnique({ where: { stripePriceId: priceId } })
    : null;
  const periodEnd = Number(
    subscription.current_period_end || item?.current_period_end || 0,
  );
  return prisma.organization.update({
    where: { id: organization.id },
    data: {
      stripeCustomerId: customerId || organization.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status || "unknown",
      subscriptionPlanKey:
        plan?.key || subscription.metadata?.planKey || organization.subscriptionPlanKey,
      subscriptionPriceId: priceId,
      subscriptionCurrentPeriodEnd: periodEnd
        ? new Date(periodEnd * 1000)
        : null,
      subscriptionCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      billingUpdatedAt: new Date(),
    },
  });
}

async function syncStripeInvoice(invoice: any) {
  const customerId = stripeObjectId(invoice.customer);
  if (!customerId) return null;
  const organization = await prisma.organization.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (!organization) return null;
  const subscriptionId = stripeObjectId(
    invoice.subscription || invoice.parent?.subscription_details?.subscription,
  );
  return prisma.stripeInvoiceRecord.upsert({
    where: { id: invoice.id },
    update: {
      status: invoice.status || "unknown",
      amountDue: Number(invoice.amount_due || 0),
      amountPaid: Number(invoice.amount_paid || 0),
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    },
    create: {
      id: invoice.id,
      organizationId: organization.id,
      subscriptionId,
      status: invoice.status || "unknown",
      currency: invoice.currency || "eur",
      amountDue: Number(invoice.amount_due || 0),
      amountPaid: Number(invoice.amount_paid || 0),
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      periodStart: invoice.period_start
        ? new Date(Number(invoice.period_start) * 1000)
        : null,
      periodEnd: invoice.period_end
        ? new Date(Number(invoice.period_end) * 1000)
        : null,
      createdAt: new Date(Number(invoice.created) * 1000),
    },
  });
}

async function syncStripeConnectAccount(account: any) {
  const organization = await prisma.organization.findUnique({
    where: { stripeConnectAccountId: account.id },
  });
  if (!organization) return null;
  return prisma.organization.update({
    where: { id: organization.id },
    data: {
      connectDetailsSubmitted: Boolean(account.details_submitted),
      connectChargesEnabled: Boolean(account.charges_enabled),
      connectPayoutsEnabled: Boolean(account.payouts_enabled),
      connectRequirementsDue: [
        ...(account.requirements?.currently_due || []),
        ...(account.requirements?.past_due || []),
      ].filter((value, index, values) => values.indexOf(value) === index),
      billingUpdatedAt: new Date(),
    },
  });
}
app.setErrorHandler((unknownError, req, reply) => {
  const err = unknownError as Error & { statusCode?: number };
  const status: number =
    err instanceof DomainError ? err.statusCode : (err.statusCode ?? 500);
  if (status >= 500 && !(err instanceof DomainError)) req.log.error(err);
  const code = err instanceof DomainError ? err.code : "REQUEST_FAILED";
  const details = err instanceof DomainError ? err.details : null;
  reply
    .status(status)
    .send(
      error(code, status >= 500 ? "Внутренняя ошибка" : err.message, details),
    );
});

async function auth(req: any, reply: any) {
  try {
    const decoded = (await req.jwtVerify()) as Identity;
    req.identity = decoded;
    const member = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: decoded.communityId,
          userId: decoded.userId,
        },
      },
      include: { user: true },
    });
    if (!member || member.user.status !== "active")
      throw new DomainError("ACCESS_DENIED", "Доступ ограничен", 403);
    if (member.enforcementStatus === "banned" || (member.enforcementStatus === "restricted" && (!member.restrictedUntil || member.restrictedUntil > new Date())))
      throw new DomainError("COMMUNITY_ACCESS_RESTRICTED", member.enforcementReason || "Доступ к этой доске ограничен", 403);
    const community = await prisma.community.findUnique({
      where: { id: decoded.communityId },
      select: { isActive: true, tenantStatus: true },
    });
    if (
      !community?.isActive ||
      !["active", "onboarding"].includes(community.tenantStatus)
    )
      throw new DomainError(
        "COMMUNITY_SUSPENDED",
        "Работа этого сообщества приостановлена",
        403,
      );
    req.identity = { ...decoded, role: member.role };
  } catch (e) {
    if (e instanceof DomainError) throw e;
    return reply
      .status(401)
      .send(error("UNAUTHORIZED", "Требуется авторизация"));
  }
}
const requireRole = (roles: Set<string>) => async (req: any, reply: any) => {
  await auth(req, reply);
  if (reply.sent) return;
  if (!roles.has(req.identity.role))
    return reply.status(403).send(error("FORBIDDEN", "Недостаточно прав"));
};
async function refreshMembership(identity: Identity) {
  const key = `membership:${identity.communityId}:${identity.telegramUserId}`;
  let status = await redis.get(key);
  if (!status) {
    const community = await prisma.community.findUniqueOrThrow({
      where: { id: identity.communityId },
      select: { telegramChatId: true },
    });
    status = await telegramMembership(
      config,
      community.telegramChatId,
      Number(identity.telegramUserId),
    );
    await redis.set(key, status, "EX", config.MEMBERSHIP_CACHE_SECONDS);
  }
  if (!["creator", "administrator", "member", "restricted"].includes(status))
    throw new DomainError(
      "NOT_GROUP_MEMBER",
      "Доска доступна только участникам группы",
      403,
    );
  return status;
}

type TelegramChatInfo = {
  title?: string;
  description?: string;
  photo?: { big_file_id?: string };
};

async function getTelegramChatInfo(
  chatId: bigint,
): Promise<TelegramChatInfo | null> {
  const cacheKey = `telegram-chat-info:${chatId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as TelegramChatInfo;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getChat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId.toString() }),
      },
    );
    const payload = (await response.json()) as {
      ok?: boolean;
      result?: TelegramChatInfo;
    };
    if (!response.ok || !payload.ok || !payload.result) return null;
    await redis.set(cacheKey, JSON.stringify(payload.result), "EX", 300);
    return payload.result;
  } catch {
    return null;
  }
}

app.get("/health", { config: { rateLimit: false } }, async () => {
  await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  return { status: "ok" };
});

app.get(
  "/api/media/:imageId",
  { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
  async (req: any, reply) => {
    const mediaToken = String(req.query?.token || "");
    let verified: { scope?: string; imageId?: string };
    try {
      verified = app.jwt.verify(mediaToken) as { scope?: string; imageId?: string };
    } catch {
      throw new DomainError("MEDIA_TOKEN_INVALID", "Ссылка на изображение недействительна", 401);
    }
    if (verified.scope !== "media" || verified.imageId !== String(req.params.imageId))
      throw new DomainError("MEDIA_TOKEN_INVALID", "Ссылка на изображение недействительна", 401);
    const image = await prisma.listingImage.findUnique({
      where: { id: String(req.params.imageId) },
      select: { storageProvider: true, storageKey: true },
    });
    if (!image?.storageKey || image.storageProvider !== "local")
      throw new DomainError("MEDIA_NOT_FOUND", "Изображение не найдено", 404);
    const file = await fs
      .readFile(path.join(config.UPLOAD_DIR, path.basename(image.storageKey)))
      .catch(() => null);
    if (!file) throw new DomainError("MEDIA_NOT_FOUND", "Изображение не найдено", 404);
    return reply
      .type("image/webp")
      .header("cache-control", "private, max-age=3600")
      .header("x-content-type-options", "nosniff")
      .send(file);
  },
);

app.get("/api/public/site", async () => {
  const [plans, documents, settings] = await prisma.$transaction([
    prisma.billingPlan.findMany({
      where: { active: true },
      select: { key: true, name: true, description: true, currency: true, unitAmount: true, interval: true, features: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.legalDocument.findMany({
      where: { published: true, effectiveAt: { lte: new Date() } },
      orderBy: [{ type: "asc" }, { effectiveAt: "desc" }],
      distinct: ["type"],
      select: { id: true, type: true, version: true, title: true, body: true, required: true, effectiveAt: true },
    }),
    prisma.platformSetting.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } }),
  ]);
  return {
    platformName: settings.platformName,
    botUsername: config.TELEGRAM_BOT_USERNAME,
    plans,
    documents,
    publication: { minimumStars: settings.minimumPublicationStars, defaultCommissionPercent: settings.defaultCommissionBps / 100, holdDays: settings.starsHoldDays },
  };
});

app.post(
  "/api/public/conversion",
  { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
  async (req: any, reply) => {
    const event = String(req.body?.event || "");
    const allowed = new Set(["landing_view", "pricing_view", "docs_view", "telegram_cta", "legal_view"]);
    if (!allowed.has(event)) throw new DomainError("CONVERSION_EVENT_INVALID", "Unknown event");
    const visitor = String(req.body?.visitor || "");
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(visitor))
      throw new DomainError("CONVERSION_VISITOR_INVALID", "Invalid visitor");
    const pathName = String(req.body?.path || "/").slice(0, 200);
    let referrerHost: string | null = null;
    try { referrerHost = req.body?.referrer ? new URL(String(req.body.referrer)).hostname.slice(0, 200) : null; } catch { referrerHost = null; }
    const visitorHash = crypto.createHash("sha256").update(`${visitor}:${config.ACCESS_TOKEN_SECRET}`).digest("hex");
    await prisma.conversionEvent.create({ data: { event, visitorHash, path: pathName, referrerHost, metadata: {} } });
    return reply.status(202).send({ accepted: true });
  },
);

app.post(
  "/api/webhooks/stripe",
  { config: { rawBody: true } as any },
  async (req: any, reply) => {
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET)
      return reply
        .status(503)
        .send(error("STRIPE_NOT_CONFIGURED", "Stripe webhook is not configured"));
    const signature = String(req.headers["stripe-signature"] || "");
    if (!signature || !req.rawBody)
      return reply
        .status(400)
        .send(error("STRIPE_SIGNATURE_REQUIRED", "Missing Stripe signature"));
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        config.STRIPE_WEBHOOK_SECRET,
      );
    } catch (unknownError) {
      return reply.status(400).send(
        error(
          "STRIPE_SIGNATURE_INVALID",
          unknownError instanceof Error
            ? unknownError.message
            : "Invalid Stripe signature",
        ),
      );
    }
    let stored = await prisma.stripeWebhookEvent.findUnique({
      where: { id: event.id },
    });
    if (stored?.status === "processed") return { received: true, duplicate: true };
    if (stored)
      stored = await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { status: "processing", attempts: { increment: 1 }, lastError: null },
      });
    else
      stored = await prisma.stripeWebhookEvent.create({
        data: {
          id: event.id,
          type: event.type,
          livemode: event.livemode,
          payload: event as any,
        },
      });
    try {
      const object: any = event.data.object;
      if (event.type === "checkout.session.completed") {
        const organizationId = String(
          object.metadata?.organizationId || object.client_reference_id || "",
        );
        if (organizationId)
          await prisma.organization.update({
            where: { id: organizationId },
            data: {
              stripeCustomerId: stripeObjectId(object.customer),
              stripeSubscriptionId: stripeObjectId(object.subscription),
              subscriptionPlanKey: object.metadata?.planKey || null,
              billingUpdatedAt: new Date(),
            },
          });
        const subscriptionId = stripeObjectId(object.subscription);
        if (subscriptionId)
          await syncStripeSubscription(
            await stripe.subscriptions.retrieve(subscriptionId),
          );
      } else if (event.type.startsWith("customer.subscription.")) {
        await syncStripeSubscription(object);
      } else if (event.type.startsWith("invoice.")) {
        await syncStripeInvoice(object);
      } else if (event.type === "account.updated") {
        await syncStripeConnectAccount(object);
      }
      await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: { status: "processed", processedAt: new Date(), lastError: null },
      });
      return { received: true };
    } catch (unknownError) {
      await prisma.stripeWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: "failed",
          lastError:
            unknownError instanceof Error ? unknownError.message.slice(0, 2000) : "unknown",
        },
      });
      throw unknownError;
    }
  },
);
app.post(
  "/api/auth/telegram",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (req: any, reply) => {
    const raw = req.body?.initData;
    if (typeof raw !== "string")
      throw new DomainError("INIT_DATA_REQUIRED", "initData обязателен");
    let verified;
    try {
      verified = validateInitData(
        raw,
        config.TELEGRAM_BOT_TOKEN,
        config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
      );
    } catch (e) {
      req.log.warn({ reason: (e as Error).message }, "initData rejected");
      throw new DomainError(
        (e as Error).message,
        "Telegram-авторизация недействительна",
        401,
      );
    }
    const replay = `init:${verified.hash}`;
    if (await redis.get(replay))
      throw new DomainError(
        "INIT_DATA_REPLAYED",
        "Эти данные входа уже использованы",
        401,
      );
    const requestedCommunity =
      typeof req.body?.community === "string"
        ? req.body.community
        : verified.startParam?.replace(/^community_/, "");
    const existingUser = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(verified.user.id) },
      include: {
        members: {
          where: {
            community: {
              isActive: true,
              tenantStatus: { in: ["active", "onboarding"] },
            },
          },
          include: { community: true },
        },
      },
    });
    let community = requestedCommunity
      ? await prisma.community.findFirst({
          where: {
            OR: [{ id: requestedCommunity }, { slug: requestedCommunity }],
            isActive: true,
            tenantStatus: { in: ["active", "onboarding"] },
          },
        })
      : existingUser?.members.length === 1
        ? existingUser.members[0].community
        : null;
    if (
      !community &&
      !requestedCommunity &&
      !existingUser?.members.length &&
      config.TELEGRAM_GROUP_ID
    )
      community = await prisma.community.findUnique({
        where: { telegramChatId: config.TELEGRAM_GROUP_ID },
      });
    if (!community)
      throw new DomainError(
        "COMMUNITY_REQUIRED",
        "Выберите сообщество, доску которого хотите открыть",
        409,
        existingUser?.members.map(({ community }) => ({
          id: community.id,
          slug: community.slug,
          name: community.name,
        })) || [],
      );
    await redis.set(
      replay,
      "1",
      "EX",
      config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    );
    const status = await telegramMembership(
      config,
      community.telegramChatId,
      verified.user.id,
    );
    if (
      !["creator", "administrator", "member", "restricted"].includes(status) &&
      !community.allowPaidNonMembers
    )
      return reply.status(403).send({
        ...error(
          "NOT_GROUP_MEMBER",
          "Эта доска объявлений доступна только участникам группы.",
        ),
        inviteUrl: community.inviteUrl,
      });
    const initialAdmins = (process.env.INITIAL_ADMIN_TELEGRAM_IDS || "").split(
      ",",
    );
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { telegramUserId: BigInt(verified.user.id) },
        update: {
          username: verified.user.username,
          firstName: verified.user.first_name,
          lastName: verified.user.last_name,
          languageCode: verified.user.language_code,
          photoUrl: verified.user.photo_url,
          lastSeenAt: new Date(),
        },
        create: {
          telegramUserId: BigInt(verified.user.id),
          username: verified.user.username,
          firstName: verified.user.first_name,
          lastName: verified.user.last_name,
          languageCode: verified.user.language_code,
          photoUrl: verified.user.photo_url,
        },
      });
      const existing = await tx.communityMember.findUnique({
        where: {
          communityId_userId: { communityId: community.id, userId: user.id },
        },
      });
      return tx.communityMember.upsert({
        where: {
          communityId_userId: { communityId: community.id, userId: user.id },
        },
        update: {
          telegramMembershipStatus: status as any,
          membershipCheckedAt: new Date(),
        },
        create: {
          communityId: community.id,
          userId: user.id,
          role:
            !existing && initialAdmins.includes(String(verified.user.id))
              ? "owner"
              : "member",
          telegramMembershipStatus: status as any,
          membershipCheckedAt: new Date(),
        },
        include: { user: true },
      });
    });
    const token = await reply.jwtSign(
      {
        userId: result.userId,
        communityId: community.id,
        role: result.role,
        telegramUserId: String(result.user.telegramUserId),
      },
      { expiresIn: config.ACCESS_TOKEN_TTL_SECONDS },
    );
    await prisma.auditEvent
      .create({
        data: {
          communityId: community.id,
          actorId: result.userId,
          scope: "authentication",
          action: "telegram_login",
          targetType: "Community",
          targetId: community.id,
          metadata: { membershipStatus: status },
        },
      })
      .catch((auditError) =>
        req.log.warn({ err: auditError }, "login audit event failed"),
      );
    return {
      accessToken: token,
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: result.userId,
        firstName: result.user.firstName,
        username: result.user.username,
        role: result.role,
        locale: result.user.languageCode,
      },
    };
  },
);

app.post(
  "/api/auth/platform/telegram",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (req: any, reply) => {
    const raw = req.body?.initData;
    if (typeof raw !== "string")
      throw new DomainError("INIT_DATA_REQUIRED", "initData обязателен");
    let verified;
    try {
      verified = validateInitData(
        raw,
        config.TELEGRAM_BOT_TOKEN,
        config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
      );
    } catch (e) {
      throw new DomainError(
        (e as Error).message,
        "Telegram-авторизация недействительна",
        401,
      );
    }
    const replay = `platform-init:${verified.hash}`;
    if (await redis.get(replay))
      throw new DomainError(
        "INIT_DATA_REPLAYED",
        "Эти данные входа уже использованы",
        401,
      );
    const user = await prisma.user.upsert({
      where: { telegramUserId: BigInt(verified.user.id) },
      update: {
        username: verified.user.username,
        firstName: verified.user.first_name,
        lastName: verified.user.last_name,
        languageCode: verified.user.language_code,
        photoUrl: verified.user.photo_url,
        lastSeenAt: new Date(),
      },
      create: {
        telegramUserId: BigInt(verified.user.id),
        username: verified.user.username,
        firstName: verified.user.first_name,
        lastName: verified.user.last_name,
        languageCode: verified.user.language_code,
        photoUrl: verified.user.photo_url,
      },
    });
    await redis.set(
      replay,
      "1",
      "EX",
      config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    );
    const accessToken = await reply.jwtSign(
      {
        scope: "platform",
        userId: user.id,
        telegramUserId: String(user.telegramUserId),
        platformRole: user.platformRole,
      },
      { expiresIn: config.ACCESS_TOKEN_TTL_SECONDS },
    );
    return {
      accessToken,
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        firstName: user.firstName,
        username: user.username,
        platformRole: user.platformRole,
      },
    };
  },
);

async function requiredLegalStatus(userId: string) {
  const documents = await prisma.legalDocument.findMany({
    where: { required: true, published: true, effectiveAt: { lte: new Date() } },
    orderBy: [{ type: "asc" }, { effectiveAt: "desc" }],
    distinct: ["type"],
    include: { acceptances: { where: { userId }, select: { acceptedAt: true } } },
  });
  return documents.map(({ acceptances, body: _body, ...document }) => ({
    ...document, accepted: acceptances.length > 0, acceptedAt: acceptances[0]?.acceptedAt || null,
  }));
}

async function requireCurrentLegalAcceptance(userId: string) {
  const missing = (await requiredLegalStatus(userId)).filter((item) => !item.accepted);
  if (missing.length)
    throw new DomainError("LEGAL_ACCEPTANCE_REQUIRED", "Примите актуальные условия и политику конфиденциальности", 428, missing.map((item) => ({ id: item.id, type: item.type, version: item.version, title: item.title })));
}

app.get("/api/platform/me", { preHandler: platformAuth }, async (req: any) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.platformIdentity.userId },
    include: {
      organizations: {
        include: {
          organization: {
            include: {
              communities: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  tenantStatus: true,
                  telegramChatId: true,
                  createdAt: true,
                  connectedAt: true,
                  disconnectedAt: true,
                  botStatus: true,
                  botIsAdministrator: true,
                  botCanDeleteMessages: true,
                  botCanRestrictMembers: true,
                  botCanInviteUsers: true,
                  botLastCheckedAt: true,
                  deletionRequestedAt: true,
                  deletionScheduledFor: true,
                  deletionFinalizedAt: true,
                  rules: true,
                  description: true,
                  _count: { select: { members: true, listings: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      platformRole: user.platformRole,
    },
    organizations: user.organizations.map((membership) => ({
      ...membership.organization,
      role: membership.role,
      communities: membership.organization.communities.map((community) => ({
        ...community,
        telegramChatId: String(community.telegramChatId),
        setup: {
          connected: ["member", "administrator"].includes(community.botStatus),
          administrator: community.botIsAdministrator,
          permissions:
            community.botCanDeleteMessages &&
            community.botCanRestrictMembers &&
            community.botCanInviteUsers,
          rules: Boolean(community.rules.trim()),
          branding: Boolean(community.description.trim()),
        },
      })),
    })),
    legalDocuments: await requiredLegalStatus(user.id),
  };
});

app.post(
  "/api/platform/legal/accept",
  { preHandler: platformAuth },
  async (req: any) => {
    const documentIds = Array.isArray(req.body?.documentIds) ? req.body.documentIds.map(String) : [];
    const required = await requiredLegalStatus(req.platformIdentity.userId);
    const requiredIds = required.filter((item) => !item.accepted).map((item) => item.id);
    if (!requiredIds.every((id) => documentIds.includes(id)))
      throw new DomainError("LEGAL_ACCEPTANCE_INCOMPLETE", "Необходимо принять все обязательные документы");
    await prisma.$transaction(async (tx) => {
      for (const documentId of requiredIds)
        await tx.legalAcceptance.upsert({
          where: { documentId_userId: { documentId, userId: req.platformIdentity.userId } },
          update: {}, create: { documentId, userId: req.platformIdentity.userId, source: "platform_web" },
        });
      if (requiredIds.length)
        await tx.auditEvent.create({ data: {
          actorId: req.platformIdentity.userId, scope: "legal", action: "legal_documents_accepted",
          targetType: "User", targetId: req.platformIdentity.userId, metadata: { documentIds: requiredIds },
        } });
    });
    return { accepted: true, documents: await requiredLegalStatus(req.platformIdentity.userId) };
  },
);

app.post(
  "/api/platform/organizations",
  { preHandler: platformAuth },
  async (req: any) => {
    await requireCurrentLegalAcceptance(req.platformIdentity.userId);
    const name = String(req.body?.name || "").trim().slice(0, 100);
    if (name.length < 2)
      throw new DomainError(
        "ORGANIZATION_NAME_REQUIRED",
        "Укажите название организации",
      );
    const baseSlug =
      name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "community";
    const slug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name, slug },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: req.platformIdentity.userId,
          role: "owner",
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.platformIdentity.userId,
          scope: "platform",
          action: "organization_created",
          targetType: "Organization",
          targetId: organization.id,
        },
      });
      return organization;
    });
  },
);

app.post(
  "/api/platform/connect-intents",
  { preHandler: platformAuth },
  async (req: any) => {
    await requireCurrentLegalAcceptance(req.platformIdentity.userId);
    const organizationId = String(req.body?.organizationId || "");
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.platformIdentity.userId,
        },
      },
    });
    if (!membership || !["owner", "administrator"].includes(membership.role))
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    await prisma.communityConnectionIntent.updateMany({
      where: {
        requestedById: req.platformIdentity.userId,
        organizationId,
        status: "pending",
      },
      data: { status: "cancelled" },
    });
    const rawToken = crypto.randomBytes(16).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const intent = await prisma.communityConnectionIntent.create({
      data: {
        tokenHash,
        organizationId,
        requestedById: req.platformIdentity.userId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return {
      id: intent.id,
      expiresAt: intent.expiresAt,
      addBotUrl: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?startgroup=connect_${rawToken}&admin=delete_messages+restrict_members+invite_users`,
    };
  },
);

app.post(
  "/api/platform/communities/:id/connection-check",
  { preHandler: platformAuth },
  async (req: any) => {
    const community = await prisma.community.findUnique({
      where: { id: String(req.params.id) },
      include: { organization: { include: { members: true } } },
    });
    if (!community || !community.organization)
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    const membership = community.organization.members.find(
      (item) => item.userId === req.platformIdentity.userId,
    );
    if (!membership || !["owner", "administrator"].includes(membership.role))
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    const bot = await telegramBotApi<{ id: number }>("getMe", {});
    let member: any;
    try {
      member = await telegramBotApi<any>("getChatMember", {
        chat_id: String(community.telegramChatId),
        user_id: bot.id,
      });
    } catch (unknownError) {
      member = { status: "unavailable" };
    }
    const isAdministrator = member.status === "administrator";
    const active = isAdministrator;
    const updated = await prisma.community.update({
      where: { id: community.id },
      data: {
        botStatus: member.status,
        botIsAdministrator: isAdministrator,
        botCanDeleteMessages:
          isAdministrator && Boolean(member.can_delete_messages),
        botCanRestrictMembers:
          isAdministrator && Boolean(member.can_restrict_members),
        botCanInviteUsers:
          isAdministrator && Boolean(member.can_invite_users),
        botLastCheckedAt: new Date(),
        ...(!active && community.tenantStatus === "active"
          ? {
              tenantStatus: "onboarding" as any,
              isActive: false,
              disconnectedAt: new Date(),
            }
          : {}),
      },
    });
    await prisma.auditEvent.create({
      data: {
        communityId: community.id,
        actorId: req.platformIdentity.userId,
        scope: "tenant_lifecycle",
        action: "bot_connection_checked",
        targetType: "Community",
        targetId: community.id,
        metadata: { status: member.status, isAdministrator },
      },
    });
    return updated;
  },
);

app.post(
  "/api/platform/communities/:id/disconnect",
  { preHandler: platformAuth },
  async (req: any) => {
    if (String(req.body?.confirmation || "") !== "DISCONNECT")
      throw new DomainError(
        "CONFIRMATION_REQUIRED",
        "Подтвердите отключение",
      );
    const community = await prisma.community.findUnique({
      where: { id: String(req.params.id) },
      include: { organization: { include: { members: true } } },
    });
    if (!community?.organization)
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    if (community.deletionScheduledFor)
      throw new DomainError(
        "DELETION_SCHEDULED",
        "Сначала отмените запланированное удаление",
        409,
      );
    const membership = community.organization.members.find(
      (item) => item.userId === req.platformIdentity.userId,
    );
    if (!membership || !["owner", "administrator"].includes(membership.role))
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.community.update({
        where: { id: community.id },
        data: {
          tenantStatus: "closed",
          isActive: false,
          disconnectedAt: new Date(),
        },
      });
      await tx.communityConnectionIntent.updateMany({
        where: { communityId: community.id, status: { in: ["pending", "claiming"] } },
        data: { status: "cancelled" },
      });
      await tx.auditEvent.create({
        data: {
          communityId: community.id,
          actorId: req.platformIdentity.userId,
          scope: "tenant_lifecycle",
          action: "community_disconnected",
          targetType: "Community",
          targetId: community.id,
        },
      });
      return updated;
    });
  },
);

app.post(
  "/api/platform/communities/:id/reconnect",
  { preHandler: platformAuth },
  async (req: any) => {
    const community = await prisma.community.findUnique({
      where: { id: String(req.params.id) },
      include: { organization: { include: { members: true } } },
    });
    if (!community?.organization)
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    if (community.deletionScheduledFor)
      throw new DomainError(
        "DELETION_SCHEDULED",
        "Сначала отмените запланированное удаление",
        409,
      );
    const membership = community.organization.members.find(
      (item) => item.userId === req.platformIdentity.userId,
    );
    if (!membership || !["owner", "administrator"].includes(membership.role))
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    const bot = await telegramBotApi<{ id: number }>("getMe", {});
    const member = await telegramBotApi<any>("getChatMember", {
      chat_id: String(community.telegramChatId),
      user_id: bot.id,
    });
    if (member.status !== "administrator")
      throw new DomainError(
        "BOT_ADMIN_REQUIRED",
        "Сначала верните бота в группу и назначьте администратором",
        409,
      );
    return prisma.$transaction(async (tx) => {
      const updated = await tx.community.update({
        where: { id: community.id },
        data: {
          tenantStatus: "active",
          isActive: true,
          connectedAt: new Date(),
          disconnectedAt: null,
          botStatus: member.status,
          botIsAdministrator: true,
          botCanDeleteMessages: Boolean(member.can_delete_messages),
          botCanRestrictMembers: Boolean(member.can_restrict_members),
          botCanInviteUsers: Boolean(member.can_invite_users),
          botLastCheckedAt: new Date(),
        },
      });
      await tx.auditEvent.create({
        data: {
          communityId: community.id,
          actorId: req.platformIdentity.userId,
          scope: "tenant_lifecycle",
          action: "community_reconnected",
          targetType: "Community",
          targetId: community.id,
        },
      });
      return updated;
    });
  },
);

app.post(
  "/api/platform/communities/:id/request-deletion",
  { preHandler: platformAuth },
  async (req: any) => {
    if (
      String(req.body?.confirmation || "") !== "DELETE" ||
      req.body?.exportAcknowledged !== true
    )
      throw new DomainError(
        "DELETION_CONFIRMATION_REQUIRED",
        "Сначала скачайте экспорт и подтвердите удаление",
      );
    const community = await prisma.community.findUnique({
      where: { id: String(req.params.id) },
      include: { organization: { include: { members: true } } },
    });
    if (!community?.organization)
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    const owner = community.organization.members.find(
      (item) =>
        item.userId === req.platformIdentity.userId && item.role === "owner",
    );
    if (!owner)
      throw new DomainError("FORBIDDEN", "Только владелец может запросить удаление", 403);
    if (community.deletionScheduledFor) return community;
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 30 * 86_400_000);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.community.update({
        where: { id: community.id },
        data: {
          tenantStatus: "closed",
          isActive: false,
          disconnectedAt: now,
          deletionRequestedAt: now,
          deletionScheduledFor: scheduledFor,
          deletionRequestedById: req.platformIdentity.userId,
        },
      });
      await tx.auditEvent.create({
        data: {
          communityId: community.id,
          actorId: req.platformIdentity.userId,
          scope: "data_retention",
          action: "community_deletion_requested",
          targetType: "Community",
          targetId: community.id,
          metadata: { scheduledFor },
        },
      });
      return updated;
    });
  },
);

app.post(
  "/api/platform/communities/:id/cancel-deletion",
  { preHandler: platformAuth },
  async (req: any) => {
    const community = await prisma.community.findUnique({
      where: { id: String(req.params.id) },
      include: { organization: { include: { members: true } } },
    });
    if (!community?.organization)
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    const owner = community.organization.members.find(
      (item) =>
        item.userId === req.platformIdentity.userId && item.role === "owner",
    );
    if (!owner)
      throw new DomainError("FORBIDDEN", "Только владелец может отменить удаление", 403);
    if (!community.deletionScheduledFor)
      throw new DomainError("DELETION_NOT_SCHEDULED", "Удаление не запланировано", 409);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.community.update({
        where: { id: community.id },
        data: {
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          deletionRequestedById: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          communityId: community.id,
          actorId: req.platformIdentity.userId,
          scope: "data_retention",
          action: "community_deletion_cancelled",
          targetType: "Community",
          targetId: community.id,
        },
      });
      return updated;
    });
  },
);

app.get(
  "/api/platform/communities/:id/export",
  { preHandler: platformAuth },
  async (req: any) => {
    const community = await prisma.community.findUnique({
      where: { id: String(req.params.id) },
      include: {
        organization: { include: { members: true } },
        members: { include: { user: true } },
        categories: true,
        listings: { include: { images: true, payment: true } },
        actions: true,
        reports: true,
        auditEvents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!community?.organization)
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    const membership = community.organization.members.find(
      (item) => item.userId === req.platformIdentity.userId,
    );
    if (!membership || !["owner", "administrator"].includes(membership.role))
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    const { organization, ...tenantData } = community;
    await prisma.auditEvent.create({
      data: {
        communityId: community.id,
        actorId: req.platformIdentity.userId,
        scope: "data_portability",
        action: "community_exported",
        targetType: "Community",
        targetId: community.id,
      },
    });
    return {
      format: "classifiedstg-community-export-v1",
      exportedAt: new Date(),
      organization: { id: organization.id, name: organization.name },
      community: tenantData,
    };
  },
);

app.post(
  "/api/platform/organizations/:id/transfer-ownership",
  { preHandler: platformAuth },
  async (req: any) => {
    const organizationId = String(req.params.id);
    const targetTelegramUserId = String(req.body?.telegramUserId || "").trim();
    if (!/^\d{3,20}$/.test(targetTelegramUserId))
      throw new DomainError("USER_ID_INVALID", "Укажите Telegram ID нового владельца");
    const current = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.platformIdentity.userId,
        },
      },
    });
    if (!current || current.role !== "owner")
      throw new DomainError("FORBIDDEN", "Только владелец может передать организацию", 403);
    const target = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(targetTelegramUserId) },
    });
    if (!target)
      throw new DomainError(
        "TARGET_NOT_REGISTERED",
        "Новый владелец должен сначала открыть бота и кабинет",
        409,
      );
    if (target.id === req.platformIdentity.userId)
      throw new DomainError("TARGET_IS_CURRENT_OWNER", "Это уже текущий владелец");
    return prisma.$transaction(async (tx) => {
      await tx.organizationMember.updateMany({
        where: {
          organizationId,
          role: "owner",
          userId: { not: target.id },
        },
        data: { role: "administrator" },
      });
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: target.id } },
        update: { role: "owner" },
        create: { organizationId, userId: target.id, role: "owner" },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.platformIdentity.userId,
          scope: "organization_security",
          action: "organization_ownership_transferred",
          targetType: "Organization",
          targetId: organizationId,
          metadata: { newOwnerId: target.id },
        },
      });
      return { organizationId, owner: { id: target.id, firstName: target.firstName } };
    });
  },
);

app.get(
  "/api/platform/organizations/:id/finance",
  { preHandler: platformAuth },
  async (req: any) => {
    const organizationId = String(req.params.id);
    await organizationPlatformMembership(
      organizationId,
      req.platformIdentity.userId,
      ["owner", "administrator"],
    );
    const [accounts, transactions, payouts] = await prisma.$transaction([
      prisma.ledgerAccount.findMany({
        where: { organizationId },
        include: { entries: { select: { amount: true } } },
      }),
      prisma.ledgerTransaction.findMany({
        where: { organizationId },
        include: {
          community: { select: { id: true, name: true } },
          payment: {
            select: {
              id: true,
              amountStars: true,
              platformFeeStars: true,
              communityShareStars: true,
              status: true,
            },
          },
        },
        orderBy: { occurredAt: "desc" },
        take: 100,
      }),
      prisma.payoutRequest.findMany({
        where: { organizationId },
        include: {
          requestedBy: { select: { firstName: true, username: true } },
          reviewedBy: { select: { firstName: true, username: true } },
        },
        orderBy: { requestedAt: "desc" },
        take: 50,
      }),
    ]);
    const balances = Object.fromEntries(
      accounts.map((account) => [
        account.kind,
        -account.entries.reduce((sum, entry) => sum + entry.amount, 0),
      ]),
    );
    return {
      currency: "XTR",
      balances: {
        pending: balances.liability_pending || 0,
        available: balances.liability_available || 0,
        reserved: balances.liability_reserved || 0,
        paidOut: payouts.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amountStars, 0),
      },
      minimumPayoutStars: (await prisma.platformSetting.findUnique({ where: { id: "global" } }))?.minimumPayoutStars || 1000,
      payoutsEnabled: (await prisma.platformSetting.findUnique({ where: { id: "global" } }))?.payoutsEnabled || false,
      transactions,
      payouts,
    };
  },
);

app.post(
  "/api/platform/organizations/:id/payouts",
  { preHandler: platformAuth },
  async (req: any) => {
    await requireCurrentLegalAcceptance(req.platformIdentity.userId);
    const organizationId = String(req.params.id);
    await organizationPlatformMembership(organizationId, req.platformIdentity.userId, ["owner"]);
    const amountStars = Number(req.body?.amountStars);
    const settings = await prisma.platformSetting.findUnique({ where: { id: "global" } });
    if (!settings?.payoutsEnabled)
      throw new DomainError("PAYOUTS_DISABLED", "Выплаты пока закрыты владельцем платформы", 409);
    if (!Number.isSafeInteger(amountStars) || amountStars < settings.minimumPayoutStars)
      throw new DomainError("PAYOUT_AMOUNT_INVALID", `Минимальная выплата — ${settings.minimumPayoutStars} Stars`);
    try {
      return await prisma.$transaction(async (tx) => {
        const payout = await tx.payoutRequest.create({ data: {
          organizationId, requestedById: req.platformIdentity.userId, amountStars,
          status: "requested", rail: "manual_sepa",
        } });
        const reservation = await reservePayoutLedger(tx, { payoutId: payout.id, organizationId, amountStars });
        const updated = await tx.payoutRequest.update({ where: { id: payout.id }, data: { reservationTransactionId: reservation.id } });
        await tx.auditEvent.create({ data: {
          actorId: req.platformIdentity.userId, scope: "platform_finance", action: "payout_requested",
          targetType: "PayoutRequest", targetId: payout.id, metadata: { organizationId, amountStars },
        } });
        return updated;
      }, { isolationLevel: "Serializable" });
    } catch (e: any) {
      if (String(e?.message || "").includes("insufficient available"))
        throw new DomainError("PAYOUT_BALANCE_INSUFFICIENT", "Недостаточно доступных Stars", 409);
      throw e;
    }
  },
);

app.post(
  "/api/platform/organizations/:id/payouts/:payoutId/cancel",
  { preHandler: platformAuth },
  async (req: any) => {
    const organizationId = String(req.params.id);
    await organizationPlatformMembership(organizationId, req.platformIdentity.userId, ["owner"]);
    return prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findFirst({ where: { id: String(req.params.payoutId), organizationId } });
      if (!payout) throw new DomainError("PAYOUT_NOT_FOUND", "Заявка не найдена", 404);
      if (payout.status !== "requested") throw new DomainError("PAYOUT_STATE_INVALID", "Эту заявку уже нельзя отменить", 409);
      await releasePayoutLedger(tx, { payoutId: payout.id, organizationId, amountStars: payout.amountStars, reason: "cancelled_by_owner" });
      const updated = await tx.payoutRequest.update({ where: { id: payout.id }, data: { status: "cancelled", processedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId: req.platformIdentity.userId, scope: "platform_finance", action: "payout_cancelled", targetType: "PayoutRequest", targetId: payout.id, metadata: { amountStars: payout.amountStars } } });
      return updated;
    });
  },
);

app.get(
  "/api/platform/organizations/:id/support",
  { preHandler: platformAuth },
  async (req: any) => {
    const organizationId = String(req.params.id);
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.platformIdentity.userId,
        },
      },
    });
    if (!membership)
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    return prisma.supportTicket.findMany({
      where: { organizationId },
      include: {
        community: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, firstName: true } },
        messages: {
          where: { internal: false },
          include: { author: { select: { id: true, firstName: true, platformRole: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  },
);

app.post(
  "/api/platform/organizations/:id/support",
  { preHandler: platformAuth },
  async (req: any) => {
    const organizationId = String(req.params.id);
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.platformIdentity.userId,
        },
      },
    });
    if (!membership)
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    const subject = String(req.body?.subject || "").trim().slice(0, 160);
    const body = String(req.body?.message || "").trim().slice(0, 5000);
    const communityId = req.body?.communityId
      ? String(req.body.communityId)
      : null;
    if (subject.length < 3 || body.length < 5)
      throw new DomainError(
        "SUPPORT_MESSAGE_INVALID",
        "Заполните тему и описание вопроса",
      );
    if (
      communityId &&
      !(await prisma.community.count({ where: { id: communityId, organizationId } }))
    )
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    return prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          organizationId,
          communityId,
          createdById: req.platformIdentity.userId,
          subject,
          messages: {
            create: { authorId: req.platformIdentity.userId, body },
          },
        },
        include: { messages: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.platformIdentity.userId,
          communityId,
          scope: "support",
          action: "support_ticket_created",
          targetType: "SupportTicket",
          targetId: ticket.id,
        },
      });
      return ticket;
    });
  },
);

app.post(
  "/api/platform/support/:id/messages",
  { preHandler: platformAuth },
  async (req: any) => {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!ticket)
      throw new DomainError("SUPPORT_TICKET_NOT_FOUND", "Обращение не найдено", 404);
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ticket.organizationId,
          userId: req.platformIdentity.userId,
        },
      },
    });
    const isStaff = platformSupportRoles.has(req.platformIdentity.platformRole);
    if (!membership && !isStaff)
      throw new DomainError("FORBIDDEN", "Недостаточно прав", 403);
    const body = String(req.body?.message || "").trim().slice(0, 5000);
    const internal = Boolean(req.body?.internal) && isStaff;
    if (body.length < 2)
      throw new DomainError("SUPPORT_MESSAGE_INVALID", "Введите сообщение");
    return prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: req.platformIdentity.userId,
          body,
          internal,
        },
      });
      if (isStaff && !internal && ticket.communityId)
        await tx.notification.create({
          data: {
            communityId: ticket.communityId,
            userId: ticket.createdById,
            type: "support_reply",
            payload: { ticketId: ticket.id, subject: ticket.subject },
          },
        });
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status:
            !isStaff && membership && ticket.status === "waiting_customer"
              ? "open"
              : ticket.status,
        },
      });
      return message;
    });
  },
);

app.get(
  "/api/platform/organizations/:id/billing",
  { preHandler: platformAuth },
  async (req: any) => {
    const membership = await organizationPlatformMembership(
      String(req.params.id),
      req.platformIdentity.userId,
    );
    const plans = await prisma.billingPlan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    const invoices = await prisma.stripeInvoiceRecord.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
      take: 24,
    });
    const organization = membership.organization;
    return {
      configured: Boolean(stripe),
      webhookConfigured: Boolean(config.STRIPE_WEBHOOK_SECRET),
      plans: plans.map((plan) => ({
        ...plan,
        available: Boolean(stripe && plan.stripePriceId),
        stripePriceId: undefined,
      })),
      subscription: {
        status: organization.subscriptionStatus,
        planKey: organization.subscriptionPlanKey,
        currentPeriodEnd: organization.subscriptionCurrentPeriodEnd,
        cancelAtPeriodEnd: organization.subscriptionCancelAtPeriodEnd,
        customerReady: Boolean(organization.stripeCustomerId),
      },
      connect: {
        accountCreated: Boolean(organization.stripeConnectAccountId),
        detailsSubmitted: organization.connectDetailsSubmitted,
        chargesEnabled: organization.connectChargesEnabled,
        payoutsEnabled: organization.connectPayoutsEnabled,
        requirementsDue: organization.connectRequirementsDue,
      },
      invoices,
    };
  },
);

app.post(
  "/api/platform/organizations/:id/billing/checkout",
  { preHandler: platformAuth },
  async (req: any) => {
    await requireCurrentLegalAcceptance(req.platformIdentity.userId);
    const stripeClient = requireStripe();
    const membership = await organizationPlatformMembership(
      String(req.params.id),
      req.platformIdentity.userId,
      ["owner"],
    );
    const organization = membership.organization;
    if (["active", "trialing", "past_due", "incomplete"].includes(organization.subscriptionStatus))
      throw new DomainError(
        "SUBSCRIPTION_ALREADY_EXISTS",
        "Управляйте текущей подпиской через Stripe Portal",
        409,
      );
    const plan = await prisma.billingPlan.findFirst({
      where: { key: String(req.body?.planKey || ""), active: true },
    });
    if (!plan?.stripePriceId)
      throw new DomainError(
        "BILLING_PLAN_UNAVAILABLE",
        "Тариф ещё не связан со Stripe Price",
        409,
      );
    let customerId = organization.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        name: organization.legalName || organization.name,
        email: organization.billingEmail || undefined,
        metadata: { organizationId: organization.id },
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: organization.id },
        data: { stripeCustomerId: customerId, billingUpdatedAt: new Date() },
      });
    }
    const session = await stripeClient.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: organization.id,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${config.APP_URL}/?mode=platform&billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.APP_URL}/?mode=platform&billing=cancelled`,
      metadata: { organizationId: organization.id, planKey: plan.key },
      subscription_data: {
        metadata: { organizationId: organization.id, planKey: plan.key },
        billing_mode: { type: "flexible" },
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: req.platformIdentity.userId,
        scope: "stripe_billing",
        action: "stripe_checkout_created",
        targetType: "Organization",
        targetId: organization.id,
        metadata: { planKey: plan.key, sessionId: session.id },
      },
    });
    return { url: session.url };
  },
);

app.post(
  "/api/platform/organizations/:id/billing/portal",
  { preHandler: platformAuth },
  async (req: any) => {
    const stripeClient = requireStripe();
    const membership = await organizationPlatformMembership(
      String(req.params.id),
      req.platformIdentity.userId,
      ["owner"],
    );
    if (!membership.organization.stripeCustomerId)
      throw new DomainError("STRIPE_CUSTOMER_MISSING", "Stripe Customer ещё не создан", 409);
    const session = await stripeClient.billingPortal.sessions.create({
      customer: membership.organization.stripeCustomerId,
      return_url: `${config.APP_URL}/?mode=platform&billing=return`,
    });
    return { url: session.url };
  },
);

app.post(
  "/api/platform/organizations/:id/connect/onboarding",
  { preHandler: platformAuth },
  async (req: any) => {
    const stripeClient = requireStripe();
    const membership = await organizationPlatformMembership(
      String(req.params.id),
      req.platformIdentity.userId,
      ["owner"],
    );
    const organization = membership.organization;
    let accountId = organization.stripeConnectAccountId;
    if (!accountId) {
      const account = await stripeClient.accounts.create({
        country: config.STRIPE_CONNECT_COUNTRY,
        capabilities: { transfers: { requested: true } },
        controller: {
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "stripe",
          stripe_dashboard: { type: "express" },
        },
        business_profile: {
          name: organization.legalName || organization.name,
          url: config.APP_URL,
        },
        metadata: { organizationId: organization.id },
      });
      accountId = account.id;
      await prisma.organization.update({
        where: { id: organization.id },
        data: { stripeConnectAccountId: accountId, billingUpdatedAt: new Date() },
      });
    }
    const link = await stripeClient.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${config.APP_URL}/?mode=platform&connect=refresh`,
      return_url: `${config.APP_URL}/?mode=platform&connect=return`,
      collection_options: { fields: "eventually_due", future_requirements: "include" },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: req.platformIdentity.userId,
        scope: "stripe_connect",
        action: "stripe_connect_onboarding_created",
        targetType: "Organization",
        targetId: organization.id,
        metadata: { accountId },
      },
    });
    return { url: link.url };
  },
);

app.post(
  "/api/platform/organizations/:id/connect/refresh",
  { preHandler: platformAuth },
  async (req: any) => {
    const stripeClient = requireStripe();
    const membership = await organizationPlatformMembership(
      String(req.params.id),
      req.platformIdentity.userId,
    );
    const accountId = membership.organization.stripeConnectAccountId;
    if (!accountId)
      throw new DomainError("STRIPE_CONNECT_MISSING", "Stripe Connect ещё не создан", 409);
    return syncStripeConnectAccount(await stripeClient.accounts.retrieve(accountId));
  },
);

app.get(
  "/api/platform/admin/overview",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async () => {
    const [
      settings,
      organizations,
      communities,
      activeCommunities,
      users,
      listings,
      payments,
    ] = await prisma.$transaction([
      prisma.platformSetting.upsert({
        where: { id: "global" },
        update: {},
        create: { id: "global" },
      }),
      prisma.organization.count(),
      prisma.community.count(),
      prisma.community.count({ where: { tenantStatus: "active" } }),
      prisma.user.count({ where: { status: "active" } }),
      prisma.listing.count(),
      prisma.publicationPayment.aggregate({
        where: { status: "paid" },
        _count: true,
        _sum: { amountStars: true },
      }),
    ]);
    return {
      settings,
      metrics: {
        organizations,
        communities,
        activeCommunities,
        users,
        listings,
        paidPublications: payments._count,
        grossStars: payments._sum.amountStars || 0,
      },
    };
  },
);

app.get(
  "/api/platform/admin/communities",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async (req: any) => {
    const search = String(req.query?.search || "").trim();
    return prisma.community.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              {
                organization: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
            ],
          }
        : undefined,
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { members: true, listings: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },
);

app.get(
  "/api/platform/admin/reliability",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async () => {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const [runs, alerts, failedNotifications, pendingNotifications] = await prisma.$transaction([
      prisma.jobRun.findMany({ where: { startedAt: { gte: since } }, orderBy: { startedAt: "desc" }, take: 100 }),
      prisma.systemAlert.findMany({ where: { status: "open" }, orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }], take: 100 }),
      prisma.notification.count({ where: { status: "failed", attempts: { gte: 5 } } }),
      prisma.notification.count({ where: { status: { in: ["pending", "processing"] } } }),
    ]);
    const latest = new Map<string, any>();
    for (const run of runs) if (!latest.has(run.jobName)) latest.set(run.jobName, run);
    return {
      checkedAt: new Date(),
      jobs: [...latest.values()],
      recentFailures: runs.filter((run) => run.status === "failed").slice(0, 20),
      alerts,
      notifications: { pending: pendingNotifications, deadLetter: failedNotifications },
    };
  },
);

app.get(
  "/api/platform/admin/legal-documents",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async () => prisma.legalDocument.findMany({
    include: { _count: { select: { acceptances: true } } },
    orderBy: [{ type: "asc" }, { effectiveAt: "desc" }],
  }),
);

app.post(
  "/api/platform/admin/legal-documents",
  { preHandler: requirePlatformRole(new Set(["platform_owner"])) },
  async (req: any) => {
    const type = String(req.body?.type || "");
    const version = String(req.body?.version || "").trim();
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const required = Boolean(req.body?.required);
    if (!["terms", "privacy", "prohibited"].includes(type) || !/^[a-zA-Z0-9._-]{1,40}$/.test(version))
      throw new DomainError("LEGAL_DOCUMENT_INVALID", "Неверный тип или версия документа");
    if (title.length < 3 || body.length < 100 || body.length > 100000)
      throw new DomainError("LEGAL_DOCUMENT_INVALID", "Заполните заголовок и текст документа");
    return prisma.$transaction(async (tx) => {
      const document = await tx.legalDocument.create({ data: {
        type, version, title, body, required, published: true,
        effectiveAt: req.body?.effectiveAt ? new Date(req.body.effectiveAt) : new Date(),
        publishedById: req.platformIdentity.userId,
      } });
      await tx.auditEvent.create({ data: {
        actorId: req.platformIdentity.userId, scope: "legal", action: "legal_document_published",
        targetType: "LegalDocument", targetId: document.id, metadata: { type, version, required },
      } });
      return document;
    });
  },
);

app.get(
  "/api/platform/admin/conversions",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async () => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [events, uniqueVisitors] = await prisma.$transaction([
      prisma.conversionEvent.groupBy({ by: ["event"], where: { createdAt: { gte: since } }, orderBy: { event: "asc" }, _count: true }),
      prisma.conversionEvent.findMany({ where: { createdAt: { gte: since } }, distinct: ["visitorHash"], select: { visitorHash: true } }),
    ]);
    return { since, uniqueVisitors: uniqueVisitors.length, events: Object.fromEntries(events.map((item) => [item.event, item._count])) };
  },
);

app.get(
  "/api/platform/admin/ledger",
  { preHandler: requirePlatformRole(platformFinanceRoles) },
  async (req: any) => {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    return prisma.ledgerTransaction.findMany({
      include: {
        organization: { select: { id: true, name: true } },
        community: { select: { id: true, name: true } },
        payment: true,
        entries: {
          include: { account: { select: { key: true, kind: true, name: true } } },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  },
);

app.get(
  "/api/platform/admin/payouts",
  { preHandler: requirePlatformRole(platformFinanceRoles) },
  async (req: any) => {
    const status = String(req.query?.status || "").trim();
    return prisma.payoutRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        organization: { select: { id: true, name: true, stripeConnectAccountId: true, connectPayoutsEnabled: true } },
        requestedBy: { select: { firstName: true, username: true } },
        reviewedBy: { select: { firstName: true, username: true } },
      },
      orderBy: { requestedAt: "desc" }, take: 200,
    });
  },
);

app.post(
  "/api/platform/admin/payouts/:id/review",
  { preHandler: requirePlatformRole(new Set(["platform_owner"])) },
  async (req: any) => {
    const decision = String(req.body?.decision || "");
    if (!["approve", "reject"].includes(decision))
      throw new DomainError("PAYOUT_DECISION_INVALID", "Укажите approve или reject");
    const settlementAmount = Number(req.body?.settlementAmount);
    const settlementCurrency = String(req.body?.settlementCurrency || "EUR").toUpperCase();
    const rail = String(req.body?.rail || "manual_sepa");
    if (decision === "approve" && (!Number.isSafeInteger(settlementAmount) || settlementAmount <= 0))
      throw new DomainError("PAYOUT_SETTLEMENT_INVALID", "Укажите сумму выплаты в центах");
    if (!/^[A-Z]{3}$/.test(settlementCurrency) || !["manual_sepa", "stripe_connect"].includes(rail))
      throw new DomainError("PAYOUT_SETTLEMENT_INVALID", "Неверная валюта или способ выплаты");
    return prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findUnique({ where: { id: String(req.params.id) }, include: { organization: true } });
      if (!payout) throw new DomainError("PAYOUT_NOT_FOUND", "Заявка не найдена", 404);
      if (payout.status !== "requested") throw new DomainError("PAYOUT_STATE_INVALID", "Заявка уже рассмотрена", 409);
      if (decision === "reject") {
        await releasePayoutLedger(tx, { payoutId: payout.id, organizationId: payout.organizationId, amountStars: payout.amountStars, reason: String(req.body?.reason || "rejected_by_platform") });
      } else if (rail === "stripe_connect" && (!payout.organization.stripeConnectAccountId || !payout.organization.connectPayoutsEnabled)) {
        throw new DomainError("CONNECT_NOT_READY", "Stripe Connect организации не готов к выплатам", 409);
      }
      const updated = await tx.payoutRequest.update({ where: { id: payout.id }, data: {
        status: decision === "approve" ? "approved" : "rejected",
        reviewedById: req.platformIdentity.userId, reviewedAt: new Date(),
        ...(decision === "approve" ? { settlementAmount, settlementCurrency, rail, statementNote: String(req.body?.statementNote || "").trim() || null } : { failureReason: String(req.body?.reason || "Отклонено платформой") }),
      } });
      await tx.auditEvent.create({ data: {
        actorId: req.platformIdentity.userId, scope: "platform_finance", action: `payout_${decision === "approve" ? "approved" : "rejected"}`,
        targetType: "PayoutRequest", targetId: payout.id, metadata: { amountStars: payout.amountStars, settlementAmount: decision === "approve" ? settlementAmount : null, settlementCurrency, rail },
      } });
      return updated;
    });
  },
);

app.post(
  "/api/platform/admin/payouts/:id/execute",
  { preHandler: requirePlatformRole(new Set(["platform_owner"])) },
  async (req: any) => {
    const payout = await prisma.payoutRequest.findUnique({ where: { id: String(req.params.id) }, include: { organization: true } });
    if (!payout) throw new DomainError("PAYOUT_NOT_FOUND", "Заявка не найдена", 404);
    if (payout.status === "paid") return payout;
    if (!['approved', 'failed'].includes(payout.status) || !payout.settlementAmount)
      throw new DomainError("PAYOUT_STATE_INVALID", "Выплата не готова к исполнению", 409);
    let externalReference = String(req.body?.externalReference || "").trim();
    let stripeTransferId: string | null = payout.stripeTransferId;
    if (payout.rail === "stripe_connect") {
      const stripeClient = requireStripe();
      if (!payout.organization.stripeConnectAccountId || !payout.organization.connectPayoutsEnabled)
        throw new DomainError("CONNECT_NOT_READY", "Stripe Connect организации не готов", 409);
      try {
        const transfer = await stripeClient.transfers.create({
          amount: payout.settlementAmount, currency: payout.settlementCurrency.toLowerCase(),
          destination: payout.organization.stripeConnectAccountId,
          description: `Community payout ${payout.id}`,
          metadata: { payoutId: payout.id, organizationId: payout.organizationId, amountStars: String(payout.amountStars) },
        }, { idempotencyKey: `community-payout-${payout.id}` });
        stripeTransferId = transfer.id;
        externalReference = transfer.id;
      } catch (e: any) {
        await prisma.payoutRequest.update({ where: { id: payout.id }, data: { status: "failed", failureReason: String(e?.message || "Stripe transfer failed").slice(0, 1000) } });
        throw new DomainError("PAYOUT_EXECUTION_FAILED", "Stripe не выполнил перевод; резерв сохранён для повтора", 502);
      }
    } else if (!externalReference) {
      throw new DomainError("PAYOUT_REFERENCE_REQUIRED", "Укажите банковский reference ручной выплаты");
    }
    return prisma.$transaction(async (tx) => {
      const current = await tx.payoutRequest.findUniqueOrThrow({ where: { id: payout.id } });
      if (current.status === "paid") return current;
      const completion = await completePayoutLedger(tx, { payoutId: payout.id, organizationId: payout.organizationId, amountStars: payout.amountStars, rail: payout.rail, externalReference });
      const updated = await tx.payoutRequest.update({ where: { id: payout.id }, data: {
        status: "paid", completionTransactionId: completion.id, stripeTransferId,
        externalReference, failureReason: null, processedAt: new Date(),
      } });
      await tx.auditEvent.create({ data: {
        actorId: req.platformIdentity.userId, scope: "platform_finance", action: "payout_paid",
        targetType: "PayoutRequest", targetId: payout.id, metadata: { rail: payout.rail, externalReference, settlementAmount: payout.settlementAmount, settlementCurrency: payout.settlementCurrency },
      } });
      return updated;
    });
  },
);

app.get(
  "/api/platform/admin/users",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async (req: any) => {
    const search = String(req.query?.search || "").trim();
    return prisma.user.findMany({
      where: search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { username: { contains: search.replace(/^@/, ""), mode: "insensitive" } },
              ...(/^\d+$/.test(search)
                ? [{ telegramUserId: BigInt(search) }]
                : []),
            ],
          }
        : { platformRole: { not: "user" } },
      select: {
        id: true,
        telegramUserId: true,
        username: true,
        firstName: true,
        lastName: true,
        status: true,
        platformRole: true,
        lastSeenAt: true,
      },
      orderBy: [{ platformRole: "desc" }, { lastSeenAt: "desc" }],
      take: 100,
    });
  },
);

app.patch(
  "/api/platform/admin/users/:id/role",
  { preHandler: requirePlatformRole(new Set(["platform_owner"])) },
  async (req: any) => {
    const platformRole = String(req.body?.platformRole || "");
    if (
      !["user", "support", "finance", "platform_admin", "platform_owner"].includes(
        platformRole,
      )
    )
      throw new DomainError("PLATFORM_ROLE_INVALID", "Неверная роль");
    const target = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!target)
      throw new DomainError("USER_NOT_FOUND", "Пользователь не найден", 404);
    if (
      target.platformRole === "platform_owner" &&
      platformRole !== "platform_owner" &&
      (await prisma.user.count({ where: { platformRole: "platform_owner", status: "active" } })) <= 1
    )
      throw new DomainError(
        "LAST_PLATFORM_OWNER",
        "Нельзя снять роль у единственного владельца платформы",
        409,
      );
    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { platformRole: platformRole as any },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.platformIdentity.userId,
          scope: "platform_security",
          action: "platform_role_changed",
          targetType: "User",
          targetId: target.id,
          metadata: { from: target.platformRole, to: platformRole },
        },
      });
      return updated;
    });
  },
);

app.get(
  "/api/platform/admin/audit",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async (req: any) => {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    return prisma.auditEvent.findMany({
      include: {
        actor: { select: { id: true, firstName: true, username: true } },
        community: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
);

app.get(
  "/api/platform/admin/support",
  { preHandler: requirePlatformRole(platformSupportRoles) },
  async (req: any) => {
    const status = String(req.query?.status || "").trim();
    return prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      include: {
        organization: { select: { id: true, name: true } },
        community: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, username: true } },
        assignedTo: { select: { id: true, firstName: true } },
        messages: {
          include: { author: { select: { id: true, firstName: true, platformRole: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 200,
    });
  },
);

app.patch(
  "/api/platform/admin/support/:id",
  { preHandler: requirePlatformRole(platformSupportRoles) },
  async (req: any) => {
    const status = String(req.body?.status || "");
    const priority = String(req.body?.priority || "");
    if (status && !["open", "in_progress", "waiting_customer", "resolved", "closed"].includes(status))
      throw new DomainError("SUPPORT_STATUS_INVALID", "Неверный статус");
    if (priority && !["low", "normal", "high", "urgent"].includes(priority))
      throw new DomainError("SUPPORT_PRIORITY_INVALID", "Неверный приоритет");
    const updated = await prisma.supportTicket.update({
      where: { id: String(req.params.id) },
      data: {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(Boolean(req.body?.assignToMe)
          ? { assignedToId: req.platformIdentity.userId }
          : {}),
        ...(status === "resolved" ? { resolvedAt: new Date() } : {}),
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: req.platformIdentity.userId,
        scope: "support",
        action: "support_ticket_updated",
        targetType: "SupportTicket",
        targetId: updated.id,
        metadata: { status: updated.status, priority: updated.priority },
      },
    });
    return updated;
  },
);

app.get(
  "/api/platform/admin/deletions",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async () =>
    prisma.community.findMany({
      where: { deletionScheduledFor: { not: null } },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { deletionScheduledFor: "asc" },
    }),
);

app.get(
  "/api/platform/admin/billing-plans",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async () => prisma.billingPlan.findMany({ orderBy: { sortOrder: "asc" } }),
);

app.patch(
  "/api/platform/admin/billing-plans/:id",
  { preHandler: requirePlatformRole(new Set(["platform_owner"])) },
  async (req: any) => {
    const plan = await prisma.billingPlan.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!plan)
      throw new DomainError("BILLING_PLAN_NOT_FOUND", "Тариф не найден", 404);
    const stripePriceId = String(req.body?.stripePriceId || "").trim() || null;
    const unitAmount = Number(req.body?.unitAmount);
    const active = Boolean(req.body?.active);
    if (stripePriceId && !/^price_[A-Za-z0-9]+$/.test(stripePriceId))
      throw new DomainError("STRIPE_PRICE_INVALID", "Stripe Price ID должен начинаться с price_");
    if (!Number.isInteger(unitAmount) || unitAmount < 0 || unitAmount > 100000000)
      throw new DomainError("BILLING_AMOUNT_INVALID", "Неверная сумма тарифа");
    if (stripe && stripePriceId) {
      const remotePrice = await stripe.prices.retrieve(stripePriceId);
      if (!remotePrice.active || remotePrice.type !== "recurring")
        throw new DomainError("STRIPE_PRICE_INVALID", "Stripe Price должен быть активным и рекуррентным");
      if (remotePrice.currency !== plan.currency)
        throw new DomainError("STRIPE_PRICE_CURRENCY", "Валюта Stripe Price не совпадает с тарифом");
    }
    const updated = await prisma.billingPlan.update({
      where: { id: plan.id },
      data: { stripePriceId, unitAmount, active },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: req.platformIdentity.userId,
        scope: "stripe_billing",
        action: "billing_plan_updated",
        targetType: "BillingPlan",
        targetId: plan.id,
        metadata: { stripePriceId, unitAmount, active },
      },
    });
    return updated;
  },
);

app.get(
  "/api/platform/admin/stripe-events",
  { preHandler: requirePlatformRole(platformFinanceRoles) },
  async (req: any) => {
    const status = String(req.query?.status || "").trim();
    return prisma.stripeWebhookEvent.findMany({
      where: status ? { status } : undefined,
      select: {
        id: true,
        type: true,
        livemode: true,
        status: true,
        attempts: true,
        lastError: true,
        processedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  },
);

app.post(
  "/api/platform/admin/communities/:id/finalize-deletion",
  { preHandler: requirePlatformRole(new Set(["platform_owner"])) },
  async (req: any) => {
    const communityId = String(req.params.id);
    if (String(req.body?.confirmation || "") !== communityId)
      throw new DomainError(
        "DELETION_CONFIRMATION_REQUIRED",
        "Для финализации укажите ID сообщества",
      );
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      include: {
        listings: { include: { images: true } },
      },
    });
    if (!community)
      throw new DomainError("COMMUNITY_NOT_FOUND", "Сообщество не найдено", 404);
    if (community.deletionFinalizedAt) return community;
    if (!community.deletionScheduledFor || community.deletionScheduledFor > new Date())
      throw new DomainError(
        "DELETION_COOLING_PERIOD",
        "30-дневный период отмены ещё не завершён",
        409,
      );
    const imageKeys = community.listings
      .flatMap((listing) => listing.images)
      .map((item) => item.storageKey)
      .filter((item): item is string => Boolean(item));
    const finalized = await prisma.$transaction(async (tx) => {
      await tx.supportTicket.updateMany({
        where: { communityId },
        data: { communityId: null },
      });
      await tx.favorite.deleteMany({ where: { listing: { communityId } } });
      await tx.listingView.deleteMany({ where: { listing: { communityId } } });
      await tx.listingImage.deleteMany({ where: { listing: { communityId } } });
      await tx.notification.deleteMany({ where: { communityId } });
      await tx.messageActivity.deleteMany({ where: { communityId } });
      await tx.communityMember.deleteMany({ where: { communityId } });
      await tx.report.updateMany({
        where: { communityId },
        data: { comment: null },
      });
      await tx.listing.updateMany({
        where: { communityId },
        data: {
          title: "Deleted listing",
          description: "",
          price: null,
          locationText: null,
          latitude: null,
          longitude: null,
          moderationComment: null,
          attributes: {},
          status: "deleted",
          deletedAt: new Date(),
        },
      });
      const updated = await tx.community.update({
        where: { id: communityId },
        data: {
          name: `Deleted community ${communityId.slice(-6)}`,
          description: "",
          rules: "",
          prohibitedWords: [],
          inviteUrl: "",
          tenantStatus: "closed",
          isActive: false,
          botStatus: "deleted",
          botIsAdministrator: false,
          botCanDeleteMessages: false,
          botCanRestrictMembers: false,
          botCanInviteUsers: false,
          deletionFinalizedAt: new Date(),
        },
      });
      await tx.auditEvent.create({
        data: {
          communityId,
          actorId: req.platformIdentity.userId,
          scope: "data_retention",
          action: "community_deletion_finalized",
          targetType: "Community",
          targetId: communityId,
          metadata: {
            scrubbedListings: community.listings.length,
            deletedImages: imageKeys.length,
            retainedFinancialRecords: true,
          },
        },
      });
      return updated;
    });
    await Promise.all(
      imageKeys.map((key) =>
        fs.unlink(path.join(config.UPLOAD_DIR, path.basename(key))).catch(() => undefined),
      ),
    );
    return finalized;
  },
);

app.post(
  "/api/platform/admin/stars/reconcile",
  { preHandler: requirePlatformRole(platformFinanceRoles) },
  async (req: any) => {
    const balance = await telegramBotApi<{ amount: number; nanostar_amount?: number }>(
      "getMyStarBalance",
      {},
    );
    const remote: any[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await telegramBotApi<{ transactions: any[] }>(
        "getStarTransactions",
        { offset, limit: 100 },
      );
      const transactions = page.transactions || [];
      remote.push(...transactions);
      if (transactions.length < 100) break;
    }
    let inserted = 0;
    let matched = 0;
    for (const transaction of remote) {
      const source = transaction.source || null;
      const receiver = transaction.receiver || null;
      const direction = receiver ? "outgoing" : "incoming";
      const invoicePayload = source?.invoice_payload || null;
      const payment = await prisma.publicationPayment.findFirst({
        where: {
          OR: [
            ...(transaction.id
              ? [{ telegramPaymentChargeId: String(transaction.id) }]
              : []),
            ...(invoicePayload ? [{ invoicePayload }] : []),
          ],
        },
        select: { id: true },
      });
      if (payment) matched++;
      const fingerprint = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            id: transaction.id || "",
            amount: transaction.amount || 0,
            nanostarAmount: transaction.nanostar_amount || 0,
            date: transaction.date || 0,
            direction,
            invoicePayload,
          }),
        )
        .digest("hex");
      const created = await prisma.telegramStarObservation.createMany({
        data: [
          {
            fingerprint,
            telegramTransactionId: String(transaction.id || ""),
            amount: Number(transaction.amount || 0),
            nanostarAmount: Number(transaction.nanostar_amount || 0),
            direction,
            transactionDate: new Date(Number(transaction.date || 0) * 1000),
            partnerType: source?.type || receiver?.type || null,
            invoicePayload,
            paymentId: payment?.id || null,
            raw: transaction,
          },
        ],
        skipDuplicates: true,
      });
      inserted += created.count;
    }
    const paidPayments = await prisma.publicationPayment.findMany({
      where: { status: "paid", telegramPaymentChargeId: { not: null } },
      select: { id: true, telegramPaymentChargeId: true },
    });
    const observedPaymentIds = new Set(
      (
        await prisma.telegramStarObservation.findMany({
          where: { paymentId: { not: null }, direction: "incoming" },
          select: { paymentId: true },
        })
      ).map((item) => item.paymentId),
    );
    const unknownIncoming = await prisma.telegramStarObservation.count({
      where: { direction: "incoming", paymentId: null },
    });
    const missingRemote = paidPayments.filter(
      (payment) => !observedPaymentIds.has(payment.id),
    );
    await prisma.auditEvent.create({
      data: {
        actorId: req.platformIdentity.userId,
        scope: "platform_finance",
        action: "telegram_stars_reconciled",
        targetType: "TelegramStarObservation",
        metadata: {
          remote: remote.length,
          inserted,
          matched,
          missingRemote: missingRemote.length,
          unknownIncoming,
        },
      },
    });
    return {
      balance,
      remoteCount: remote.length,
      inserted,
      matched,
      missingRemote,
      unknownIncoming,
    };
  },
);

app.post(
  "/api/platform/admin/stars/settle",
  { preHandler: requirePlatformRole(platformFinanceRoles) },
  async (req: any) => {
    const settings = await prisma.platformSetting.findUniqueOrThrow({
      where: { id: "global" },
    });
    const cutoff = new Date(Date.now() - settings.starsHoldDays * 86_400_000);
    const candidates = await prisma.ledgerTransaction.findMany({
      where: {
        type: "stars_publication_paid",
        status: "pending_settlement",
        occurredAt: { lte: cutoff },
        payment: {
          is: {
            status: "paid",
            telegramObservations: { some: { direction: "incoming" } },
          },
        },
      },
      select: { id: true },
      take: 500,
    });
    const settled: string[] = [];
    const errors: { id: string; message: string }[] = [];
    for (const candidate of candidates) {
      try {
        await prisma.$transaction((tx) =>
          settlePaidPublicationLedger(tx, candidate.id),
        );
        settled.push(candidate.id);
      } catch (unknownError) {
        errors.push({
          id: candidate.id,
          message:
            unknownError instanceof Error ? unknownError.message : "unknown error",
        });
      }
    }
    await prisma.auditEvent.create({
      data: {
        actorId: req.platformIdentity.userId,
        scope: "platform_finance",
        action: "telegram_stars_settled",
        targetType: "LedgerTransaction",
        metadata: { cutoff, settled: settled.length, errors },
      },
    });
    return { cutoff, eligible: candidates.length, settled: settled.length, errors };
  },
);

app.post(
  "/api/platform/admin/payments/:id/refund",
  { preHandler: requirePlatformRole(platformFinanceRoles) },
  async (req: any) => {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3 || reason.length > 500)
      throw new DomainError(
        "REFUND_REASON_REQUIRED",
        "Укажите причину возврата (от 3 до 500 символов)",
      );
    const payment = await prisma.publicationPayment.findUnique({
      where: { id: String(req.params.id) },
      include: { listing: true, community: true },
    });
    if (!payment)
      throw new DomainError("PAYMENT_NOT_FOUND", "Платёж не найден", 404);
    if (payment.status === "refunded") return payment;
    if (payment.status !== "paid" || !payment.telegramPaymentChargeId)
      throw new DomainError(
        "PAYMENT_NOT_REFUNDABLE",
        "Этот платёж нельзя вернуть",
        409,
      );
    const locked = await prisma.publicationPayment.updateMany({
      where: { id: payment.id, status: "paid" },
      data: { status: "refund_processing" },
    });
    if (locked.count !== 1)
      throw new DomainError("REFUND_IN_PROGRESS", "Возврат уже выполняется", 409);
    try {
      await telegramBotApi<boolean>("refundStarPayment", {
        user_id: payment.userId
          ? Number(
              (
                await prisma.user.findUniqueOrThrow({
                  where: { id: payment.userId },
                  select: { telegramUserId: true },
                })
              ).telegramUserId,
            )
          : undefined,
        telegram_payment_charge_id: payment.telegramPaymentChargeId,
      });
    } catch (unknownError) {
      await prisma.publicationPayment.updateMany({
        where: { id: payment.id, status: "refund_processing" },
        data: { status: "paid" },
      });
      throw unknownError;
    }
    return prisma.$transaction(async (tx) => {
      await recordRefundLedger(tx, {
        originalExternalRef: `telegram-stars:${payment.telegramPaymentChargeId}`,
        refundExternalRef: `telegram-stars-refund:${payment.telegramPaymentChargeId}`,
        reason,
      });
      const refunded = await tx.publicationPayment.update({
        where: { id: payment.id },
        data: { status: "refunded" },
      });
      await tx.listing.update({
        where: { id: payment.listingId },
        data: {
          paymentStatus: "refunded",
          ...(payment.listing.status === "published" ? { status: "hidden" } : {}),
        },
      });
      await tx.notification.create({
        data: {
          userId: payment.userId,
          communityId: payment.communityId,
          type: "payment_refunded",
          payload: { listingId: payment.listingId, reason },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.platformIdentity.userId,
          communityId: payment.communityId,
          scope: "platform_finance",
          action: "telegram_stars_refunded",
          targetType: "PublicationPayment",
          targetId: payment.id,
          metadata: { reason, amountStars: payment.amountStars },
        },
      });
      return refunded;
    });
  },
);

app.patch(
  "/api/platform/admin/settings",
  { preHandler: requirePlatformRole(new Set(["platform_owner"])) },
  async (req: any) => {
    const minimumPublicationStars = Number(
      req.body?.minimumPublicationStars,
    );
    const defaultCommissionBps = Number(req.body?.defaultCommissionBps);
    const starsHoldDays = Number(req.body?.starsHoldDays);
    const minimumPayoutStars = Number(req.body?.minimumPayoutStars);
    const payoutsEnabled = Boolean(req.body?.payoutsEnabled);
    if (
      !Number.isInteger(minimumPublicationStars) ||
      minimumPublicationStars < 1 ||
      minimumPublicationStars > 100000
    )
      throw new DomainError(
        "PLATFORM_SETTINGS_INVALID",
        "Минимальная цена должна быть от 1 до 100000 Stars",
      );
    if (!Number.isInteger(starsHoldDays) || starsHoldDays < 0 || starsHoldDays > 90)
      throw new DomainError(
        "PLATFORM_SETTINGS_INVALID",
        "Период разблокировки должен быть от 0 до 90 дней",
      );
    if (
      !Number.isInteger(minimumPayoutStars) ||
      minimumPayoutStars < 1 ||
      minimumPayoutStars > 10000000
    )
      throw new DomainError(
        "PLATFORM_SETTINGS_INVALID",
        "Порог выплаты должен быть от 1 до 10000000 Stars",
      );
    if (
      !Number.isInteger(defaultCommissionBps) ||
      defaultCommissionBps < 0 ||
      defaultCommissionBps > 9000
    )
      throw new DomainError(
        "PLATFORM_SETTINGS_INVALID",
        "Комиссия должна быть от 0% до 90%",
      );
    const settings = await prisma.platformSetting.update({
      where: { id: "global" },
      data: {
        minimumPublicationStars,
        defaultCommissionBps,
        starsHoldDays,
        minimumPayoutStars,
        payoutsEnabled,
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: req.platformIdentity.userId,
        scope: "platform",
        action: "platform_settings_updated",
        targetType: "PlatformSetting",
        targetId: settings.id,
        metadata: {
          minimumPublicationStars,
          defaultCommissionBps,
          starsHoldDays,
          minimumPayoutStars,
          payoutsEnabled,
        },
      },
    });
    return settings;
  },
);

app.patch(
  "/api/platform/admin/communities/:id/status",
  { preHandler: requirePlatformRole(platformAdminRoles) },
  async (req: any) => {
    const tenantStatus = String(req.body?.tenantStatus || "");
    if (!['active', 'suspended'].includes(tenantStatus))
      throw new DomainError(
        "TENANT_STATUS_INVALID",
        "Допустимы статусы active и suspended",
      );
    const community = await prisma.community.update({
      where: { id: req.params.id },
      data: {
        tenantStatus: tenantStatus as any,
        suspendedAt: tenantStatus === "suspended" ? new Date() : null,
      },
    });
    await prisma.auditEvent.create({
      data: {
        communityId: community.id,
        actorId: req.platformIdentity.userId,
        scope: "platform",
        action:
          tenantStatus === "suspended"
            ? "community_suspended"
            : "community_reactivated",
        targetType: "Community",
        targetId: community.id,
      },
    });
    return community;
  },
);

app.get("/api/me", { preHandler: auth }, async (req: any) => {
  const member = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId: req.identity.communityId,
        userId: req.identity.userId,
      },
    },
    include: { user: true, community: true },
  });
  if (!member) return null;
  return {
    ...member,
    user: {
      ...member.user,
      telegramUserId: String(member.user.telegramUserId),
    },
    community: {
      ...member.community,
      telegramChatId: String(member.community.telegramChatId),
    },
  };
});
app.get("/api/community/showcase", { preHandler: auth }, async (req: any) => {
  const [community, activity, chat] = await Promise.all([
    prisma.community.findUniqueOrThrow({
      where: { id: req.identity.communityId },
    }),
    prisma.messageActivity.findUnique({
      where: {
        communityId_userId_month: {
          communityId: req.identity.communityId,
          userId: req.identity.userId,
          month: new Date().toISOString().slice(0, 7),
        },
      },
    }),
    prisma.community
      .findUniqueOrThrow({ where: { id: req.identity.communityId } })
      .then((selectedCommunity) =>
        getTelegramChatInfo(selectedCommunity.telegramChatId),
      ),
  ]);
  const messageCount = activity?.messageCount || 0;
  const isPrivileged = privilegedRoles.has(req.identity.role);
  const freeForUser =
    isPrivileged || messageCount >= community.minMonthlyMessagesForFree;
  return {
    name: chat?.title || community.name,
    description:
      community.description ||
      chat?.description ||
      "Объявления участников нашего сообщества в одном удобном месте.",
    hasAvatar: Boolean(chat?.photo?.big_file_id),
    inviteUrl: community.inviteUrl,
    minMonthlyMessagesForFree: community.minMonthlyMessagesForFree,
    publicationPriceStars: community.publicationPriceStars,
    allowPaidNonMembers: community.allowPaidNonMembers,
    messageCount,
    freeForUser,
    isPrivileged,
    messagesRemaining: freeForUser
      ? 0
      : Math.max(community.minMonthlyMessagesForFree - messageCount, 0),
  };
});
app.get("/api/community/avatar", { preHandler: auth }, async (req: any, reply) => {
  const community = await prisma.community.findUniqueOrThrow({
    where: { id: req.identity.communityId },
    select: { telegramChatId: true },
  });
  const chat = await getTelegramChatInfo(community.telegramChatId);
  const fileId = chat?.photo?.big_file_id;
  if (!fileId)
    throw new DomainError("COMMUNITY_AVATAR_NOT_FOUND", "Аватар не найден", 404);
  const fileResponse = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getFile`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    },
  );
  const filePayload = (await fileResponse.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  if (!fileResponse.ok || !filePayload.ok || !filePayload.result?.file_path)
    throw new DomainError("COMMUNITY_AVATAR_UNAVAILABLE", "Аватар недоступен", 502);
  const imageResponse = await fetch(
    `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePayload.result.file_path}`,
  );
  if (!imageResponse.ok)
    throw new DomainError("COMMUNITY_AVATAR_UNAVAILABLE", "Аватар недоступен", 502);
  const image = Buffer.from(await imageResponse.arrayBuffer());
  return reply
    .type(imageResponse.headers.get("content-type") || "image/jpeg")
    .header("cache-control", "private, max-age=300")
    .send(image);
});
app.patch("/api/me/settings", { preHandler: auth }, async (req: any) => {
  const allowed = [
    "notifyListingUpdates",
    "notifyBuyerInterest",
    "allowDirectContact",
  ];
  const data = Object.fromEntries(
    Object.entries(req.body || {}).filter(
      ([key, value]) => allowed.includes(key) && typeof value === "boolean",
    ),
  );
  if (!Object.keys(data).length)
    throw new DomainError("SETTINGS_INVALID", "Нет допустимых настроек");
  return prisma.communityMember.update({
    where: {
      communityId_userId: {
        communityId: req.identity.communityId,
        userId: req.identity.userId,
      },
    },
    data,
  });
});
app.delete("/api/me", { preHandler: auth }, async (req: any) => {
  await refreshMembership(req.identity);
  await prisma.$transaction([
    prisma.listing.updateMany({
      where: {
        authorId: req.identity.userId,
        status: { in: ["draft", "pending", "changes_requested", "published"] },
      },
      data: { status: "hidden" },
    }),
    prisma.notification.deleteMany({ where: { userId: req.identity.userId } }),
    prisma.user.update({
      where: { id: req.identity.userId },
      data: {
        status: "deleted",
        username: null,
        firstName: "Deleted user",
        lastName: null,
        photoUrl: null,
        languageCode: null,
      },
    }),
  ]);
  await redis.del(
    `membership:${req.identity.communityId}:${req.identity.telegramUserId}`,
  );
  return { ok: true };
});
app.get("/api/categories", { preHandler: auth }, async (req: any) =>
  prisma.category.findMany({
    where: { communityId: req.identity.communityId, isActive: true },
    orderBy: { sortOrder: "asc" },
  }),
);

app.get("/api/listings", { preHandler: auth }, async (req: any) => {
  const q = req.query || {};
  const where: any = {
    communityId: req.identity.communityId,
    status: "published",
  };
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.condition) where.condition = q.condition;
  if (q.priceType) where.priceType = q.priceType;
  if (q.withImages === "true") where.images = { some: {} };
  if (q.minPrice || q.maxPrice)
    where.price = { gte: q.minPrice, lte: q.maxPrice };
  if (q.search)
    where.OR = ["title", "description", "locationText"].map((k) => ({
      [k]: { contains: q.search, mode: "insensitive" },
    }));
  const order: any =
    q.sort === "price_asc"
      ? { price: "asc" }
      : q.sort === "price_desc"
        ? { price: "desc" }
        : q.sort === "popular"
          ? { viewCount: "desc" }
          : { publishedAt: "desc" };
  const listings = await prisma.listing.findMany({
    where,
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      category: true,
      author: { select: { firstName: true, username: true } },
      favorites: {
        where: { userId: req.identity.userId },
        select: { id: true },
      },
      _count: { select: { images: true } },
    },
    orderBy: order,
    take: Math.min(Number(q.limit) || 30, 100),
  });
  return listings.map(({ favorites, _count, ...listing }) => ({
    ...listing,
    isFavorite: favorites.length > 0,
    imageCount: _count.images,
  }));
});
app.get("/api/listings/:id", { preHandler: auth }, async (req: any) => {
  const listing = await prisma.listing.findFirst({
    where: {
      id: req.params.id,
      communityId: req.identity.communityId,
      OR: [{ status: "published" }, { authorId: req.identity.userId }],
    },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      author: {
        select: { id: true, firstName: true, username: true, createdAt: true },
      },
    },
  });
  if (!listing)
    throw new DomainError("LISTING_NOT_FOUND", "Объявление не найдено", 404);
  if (listing.authorId !== req.identity.userId) {
    const viewed = await prisma.listingView
      .upsert({
        where: {
          userId_listingId: {
            userId: req.identity.userId,
            listingId: listing.id,
          },
        },
        update: {},
        create: { userId: req.identity.userId, listingId: listing.id },
      })
      .catch(() => null);
    if (viewed)
      await prisma.listing.update({
        where: { id: listing.id },
        data: { viewCount: { increment: 1 } },
      });
  }
  return listing;
});
app.post(
  "/api/listings",
  {
    preHandler: auth,
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
  },
  async (req: any) => {
    const b = req.body || {};
    if (!b.categoryId || typeof b.title !== "string")
      throw new DomainError(
        "VALIDATION_ERROR",
        "Категория и название обязательны",
      );
    const category = await prisma.category.findFirst({
      where: {
        id: b.categoryId,
        communityId: req.identity.communityId,
        isActive: true,
      },
    });
    if (!category)
      throw new DomainError("CATEGORY_NOT_FOUND", "Категория не найдена", 404);
    return prisma.listing.create({
      data: {
        communityId: req.identity.communityId,
        authorId: req.identity.userId,
        categoryId: b.categoryId,
        title: b.title.slice(0, config.MAX_LISTING_TITLE_LENGTH),
        description: String(b.description || "").slice(
          0,
          config.MAX_LISTING_DESCRIPTION_LENGTH,
        ),
        price: b.price,
        priceType: b.priceType || "fixed",
        condition: (category as any).conditionEnabled
          ? b.condition || "good"
          : "not_applicable",
        currency: b.currency || "EUR",
        locationText: b.locationText,
        contactMode: b.contactMode || "telegram",
        attributes: b.attributes || {},
      },
    });
  },
);
app.patch("/api/listings/:id", { preHandler: auth }, async (req: any) => {
  const listing = await prisma.listing.findFirst({
    where: {
      id: req.params.id,
      communityId: req.identity.communityId,
      authorId: req.identity.userId,
    },
  });
  if (!listing)
    throw new DomainError("LISTING_NOT_FOUND", "Объявление не найдено", 404);
  if (
    ![
      "draft",
      "changes_requested",
      "rejected",
      "expired",
      "published",
    ].includes(listing.status)
  )
    throw new DomainError(
      "LISTING_NOT_EDITABLE",
      "Объявление в этом статусе нельзя изменить",
      409,
    );
  const allowed = [
    "title",
    "description",
    "price",
    "priceType",
    "condition",
    "categoryId",
    "locationText",
    "contactMode",
    "attributes",
  ];
  const data = Object.fromEntries(
    Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)),
  );
  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: {
        id: String(data.categoryId),
        communityId: req.identity.communityId,
        isActive: true,
      },
    });
    if (!category)
      throw new DomainError("CATEGORY_NOT_FOUND", "Категория не найдена", 404);
    if (!(category as any).conditionEnabled) data.condition = "not_applicable";
  }
  if (listing.status === "published")
    data.status = (
      await prisma.community.findUniqueOrThrow({
        where: { id: req.identity.communityId },
      })
    ).remoderatePublishedEdits
      ? "pending"
      : "published";
  return prisma.listing.update({ where: { id: listing.id }, data });
});
app.post(
  "/api/listings/:id/transition",
  { preHandler: auth },
  async (req: any) => {
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.id, communityId: req.identity.communityId },
      include: { category: true, images: { select: { id: true } }, author: { select: { createdAt: true } } },
    });
    if (!listing || listing.authorId !== req.identity.userId)
      throw new DomainError("LISTING_NOT_FOUND", "Объявление не найдено", 404);
    const to = req.body?.status;
    const memberActions = [
      "pending",
      "sold",
      "archived",
      "deleted",
      "draft",
      "published",
    ];
    if (!memberActions.includes(to))
      throw new DomainError(
        "FORBIDDEN_TRANSITION",
        "Недоступное действие",
        403,
      );
    assertListingTransition(listing.status, to);
    if (to === "pending") {
      const invalidFields = validateTaxonomyAttributes(
        listing.category.fieldSchema,
        listing.attributes,
      );
      const missing: string[] = [];
      if (!listing.title.trim()) missing.push("Название");
      if (!listing.description.trim()) missing.push("Описание");
      if (!listing.locationText?.trim()) missing.push("Местоположение");
      if (!listing.images.length) missing.push("Хотя бы одна фотография");
      if (listing.priceType === "fixed" && listing.price === null)
        missing.push("Цена");
      if (invalidFields.length || missing.length)
        throw new DomainError(
          "LISTING_INCOMPLETE",
          "Заполните обязательные поля",
          400,
          { fields: [...missing, ...invalidFields] },
        );
      const active = await prisma.listing.count({
        where: {
          authorId: req.identity.userId,
          communityId: req.identity.communityId,
          status: { in: ["pending", "published"] },
        },
      });
      const community = await prisma.community.findUniqueOrThrow({
        where: { id: req.identity.communityId },
      });
      if (active >= community.maxActiveListingsPerUser)
        throw new DomainError(
          "ACTIVE_LISTING_LIMIT",
          "Достигнут лимит объявлений",
          409,
        );
      const sinceDay = new Date(Date.now() - 86_400_000);
      const listingsToday = await prisma.listing.count({
        where: { communityId: community.id, authorId: req.identity.userId, createdAt: { gte: sinceDay } },
      });
      if (community.abuseProtectionMode === "enforce" && listingsToday > community.maxListingsPerDay)
        throw new DomainError("LISTING_VELOCITY_LIMIT", `Можно создать не более ${community.maxListingsPerDay} объявлений за 24 часа`, 429);
      const duplicateCandidates = await prisma.listing.findMany({
        where: {
          id: { not: listing.id }, communityId: community.id, authorId: req.identity.userId,
          status: { notIn: ["deleted", "rejected"] },
          createdAt: { gte: new Date(Date.now() - community.duplicateWindowDays * 86_400_000) },
        },
        select: { id: true, title: true, description: true }, take: 50,
      });
      let duplicateSimilarity = 0;
      let duplicateOf: string | null = null;
      for (const candidate of duplicateCandidates) {
        const similarity = tokenSimilarity(`${listing.title} ${listing.description}`, `${candidate.title} ${candidate.description}`);
        if (similarity > duplicateSimilarity) { duplicateSimilarity = similarity; duplicateOf = candidate.id; }
      }
      const listingRisk = scoreListingRisk({
        title: listing.title, description: listing.description,
        prohibitedWords: community.prohibitedWords,
        duplicateSimilarity: duplicateSimilarity >= community.duplicateSimilarityPercent ? 85 : duplicateSimilarity,
        accountAgeHours: (Date.now() - listing.author.createdAt.getTime()) / 3_600_000,
        links: (`${listing.title} ${listing.description}`.match(/(?:https?:\/\/|www\.|t\.me\/)/gi) || []).length,
      });
      const requiresManualReview = community.abuseProtectionMode !== "off" && listingRisk.score >= community.riskyListingThreshold;
      await prisma.$transaction(async (tx) => {
        await tx.listing.update({ where: { id: listing.id }, data: {
          duplicateSuspected: duplicateSimilarity >= community.duplicateSimilarityPercent,
          riskScore: listingRisk.score, riskReasons: listingRisk.reasons,
          requiresManualReview,
        } });
        if (listingRisk.score > 0 && !(await tx.abuseEvent.findFirst({ where: { listingId: listing.id, type: "listing_risk", status: "open" } })))
          await tx.abuseEvent.create({ data: {
            communityId: community.id, userId: listing.authorId, listingId: listing.id,
            type: "listing_risk", severity: requiresManualReview ? "high" : "low",
            score: listingRisk.score, reasons: listingRisk.reasons,
            metadata: { duplicateSimilarity, duplicateOf, prohibitedMatches: listingRisk.prohibitedMatches },
          } });
      });
      const month = new Date().toISOString().slice(0, 7);
      const activity = await prisma.messageActivity.findUnique({
        where: {
          communityId_userId_month: {
            communityId: req.identity.communityId,
            userId: req.identity.userId,
            month,
          },
        },
      });
      const free =
        privilegedRoles.has(req.identity.role) ||
        (activity?.messageCount || 0) >= community.minMonthlyMessagesForFree;
      if (!free && listing.paymentStatus !== "paid")
        throw new DomainError(
          "PUBLICATION_PAYMENT_REQUIRED",
          `Для публикации нужно ${community.publicationPriceStars} Stars`,
          402,
          {
            amountStars: community.publicationPriceStars,
            listingId: listing.id,
            messageCount: activity?.messageCount || 0,
            requiredMessages: community.minMonthlyMessagesForFree,
          },
        );
    }
    const data: any = { status: to };
    if (to === "sold") data.soldAt = new Date();
    if (to === "deleted") data.deletedAt = new Date();
    return prisma.$transaction(async (tx) => {
      const updated = await tx.listing.update({
        where: { id: listing.id },
        data,
      });
      if (to === "pending") {
        await tx.notification.create({
          data: {
            communityId: req.identity.communityId,
            type: "moderation_pending",
            payload: { listingId: listing.id },
          },
        });
        await tx.notification.create({
          data: {
            communityId: req.identity.communityId,
            userId: listing.authorId,
            type: "listing_pending",
            payload: { listingId: listing.id },
          },
        });
      }
      return updated;
    });
  },
);
app.post(
  "/api/listings/:id/payment-link",
  { preHandler: auth },
  async (req: any) => {
    const listing = await prisma.listing.findFirst({
      where: {
        id: req.params.id,
        communityId: req.identity.communityId,
        authorId: req.identity.userId,
        status: "draft",
      },
      include: { author: { select: { createdAt: true } } },
    });
    if (!listing)
      throw new DomainError("LISTING_NOT_PAYABLE", "Черновик не найден", 404);
    const [community, platformSettings] = await prisma.$transaction([
      prisma.community.findUniqueOrThrow({
        where: { id: req.identity.communityId },
      }),
      prisma.platformSetting.upsert({
        where: { id: "global" },
        update: {},
        create: { id: "global" },
      }),
    ]);
    if (!community.organizationId)
      throw new DomainError(
        "COMMUNITY_BILLING_NOT_CONFIGURED",
        "Для сообщества не настроена организация",
        409,
      );
    const split = splitStarsCommission(
      community.publicationPriceStars,
      platformSettings.defaultCommissionBps,
    );
    const payload = `publication:${listing.id}:${crypto.randomUUID()}`;
    const existingPayment = await prisma.publicationPayment.findUnique({
      where: { listingId: listing.id },
    });
    if (existingPayment?.status === "paid")
      throw new DomainError(
        "PUBLICATION_ALREADY_PAID",
        "Публикация уже оплачена",
        409,
      );
    const invoicesToday = await prisma.publicationPayment.count({
      where: { communityId: community.id, userId: req.identity.userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    const paymentRisk = scorePaymentRisk({
      invoicesToday, maxInvoicesPerDay: community.maxPaidInvoicesPerDay,
      listingRiskScore: listing.riskScore,
      accountAgeHours: (Date.now() - listing.author.createdAt.getTime()) / 3_600_000,
    });
    const needsReview = community.abuseProtectionMode === "enforce" && paymentRisk.score >= 50 && existingPayment?.reviewStatus !== "approved";
    const storedPayment = await prisma.publicationPayment.upsert({
      where: { listingId: listing.id },
      update: {
        amountStars: community.publicationPriceStars,
        commissionBps: split.commissionBps,
        platformFeeStars: split.platformFeeStars,
        communityShareStars: split.communityShareStars,
        invoicePayload: payload,
        status: "pending",
        telegramPaymentChargeId: null,
        paidAt: null,
        riskScore: paymentRisk.score,
        riskReasons: paymentRisk.reasons,
        reviewStatus: existingPayment?.reviewStatus === "approved" ? "approved" : needsReview ? "review" : "clear",
      },
      create: {
        communityId: community.id,
        userId: req.identity.userId,
        listingId: listing.id,
        amountStars: community.publicationPriceStars,
        commissionBps: split.commissionBps,
        platformFeeStars: split.platformFeeStars,
        communityShareStars: split.communityShareStars,
        invoicePayload: payload,
        riskScore: paymentRisk.score,
        riskReasons: paymentRisk.reasons,
        reviewStatus: needsReview ? "review" : "clear",
      },
    });
    if (needsReview) {
      if (!(await prisma.abuseEvent.findFirst({ where: { paymentId: storedPayment.id, type: "payment_risk", status: "open" } })))
        await prisma.abuseEvent.create({ data: {
          communityId: community.id, userId: req.identity.userId, listingId: listing.id,
          paymentId: storedPayment.id, type: "payment_risk", severity: "high",
          score: paymentRisk.score, reasons: paymentRisk.reasons,
          metadata: { invoicesToday },
        } });
      throw new DomainError("PAYMENT_REVIEW_REQUIRED", "Перед оплатой нужна проверка администратора. Мы уведомили модераторов.", 409, { listingId: listing.id });
    }
    const response = await fetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Публикация объявления",
          description: `Публикация «${listing.title}» после модерации`,
          payload,
          provider_token: "",
          currency: "XTR",
          prices: [
            { label: "Публикация", amount: community.publicationPriceStars },
          ],
        }),
      },
    );
    const result = (await response.json()) as any;
    if (!result.ok)
      throw new DomainError(
        "INVOICE_CREATE_FAILED",
        "Не удалось создать счёт Stars",
        502,
      );
    return {
      invoiceUrl: result.result,
      amountStars: community.publicationPriceStars,
      platformFeeStars: split.platformFeeStars,
      communityShareStars: split.communityShareStars,
    };
  },
);
app.get("/api/my/listings", { preHandler: auth }, async (req: any) =>
  prisma.listing.findMany({
    where: {
      communityId: req.identity.communityId,
      authorId: req.identity.userId,
      status: req.query?.status,
    },
    include: { images: { take: 1 } },
    orderBy: { updatedAt: "desc" },
  }),
);
app.get("/api/my/favorites", { preHandler: auth }, async (req: any) =>
  prisma.favorite.findMany({
    where: {
      userId: req.identity.userId,
      listing: {
        communityId: req.identity.communityId,
        status: "published",
      },
    },
    include: { listing: { include: { images: { take: 1 }, category: true } } },
  }),
);
app.post(
  "/api/listings/:id/favorite",
  { preHandler: auth },
  async (req: any) => {
    const listing = await prisma.listing.findFirst({
      where: {
        id: req.params.id,
        status: "published",
        communityId: req.identity.communityId,
      },
    });
    if (!listing || listing.authorId === req.identity.userId)
      throw new DomainError(
        "FAVORITE_NOT_ALLOWED",
        "Нельзя добавить это объявление",
        409,
      );
    return prisma.$transaction(async (tx) => {
      const existing = await tx.favorite.findUnique({
        where: {
          userId_listingId: {
            userId: req.identity.userId,
            listingId: listing.id,
          },
        },
      });
      if (existing) {
        await tx.favorite.delete({ where: { id: existing.id } });
        await tx.listing.update({
          where: { id: listing.id },
          data: { favoritesCount: { decrement: 1 } },
        });
        return { favorite: false };
      }
      await tx.favorite.create({
        data: { userId: req.identity.userId, listingId: listing.id },
      });
      await tx.listing.update({
        where: { id: listing.id },
        data: { favoritesCount: { increment: 1 } },
      });
      return { favorite: true };
    });
  },
);
app.post(
  "/api/listings/:id/report",
  { preHandler: auth, config: { rateLimit: { max: 10, timeWindow: "1 day" } } },
  async (req: any) => {
    const listing = await prisma.listing.findFirst({
      where: {
        id: req.params.id,
        status: "published",
        communityId: req.identity.communityId,
      },
    });
    if (!listing)
      throw new DomainError("LISTING_NOT_FOUND", "Объявление не найдено", 404);
    if (listing.authorId === req.identity.userId)
      throw new DomainError(
        "OWN_LISTING_REPORT",
        "Нельзя жаловаться на своё объявление",
        409,
      );
    const allowed = [
      "spam",
      "fraud",
      "prohibited_item",
      "incorrect_category",
      "offensive_content",
      "duplicate",
      "sold_or_unavailable",
      "personal_data",
      "other",
    ];
    if (!allowed.includes(req.body?.reason))
      throw new DomainError("REPORT_REASON_INVALID", "Выберите причину");
    const report = await prisma.report
      .create({
        data: {
          communityId: req.identity.communityId,
          listingId: listing.id,
          reporterId: req.identity.userId,
          reason: req.body.reason,
          comment: req.body.comment,
        },
      })
      .catch(() => {
        throw new DomainError(
          "REPORT_DUPLICATE",
          "Такая жалоба уже отправлена",
          409,
        );
      });
    const community = await prisma.community.findUniqueOrThrow({
      where: { id: req.identity.communityId },
    });
    const count = await prisma.report.count({
      where: {
        listingId: listing.id,
        status: "open",
        reporter: {
          status: "active",
          createdAt: { lt: new Date(Date.now() - 86400000) },
        },
      },
    });
    if (count >= community.autoHideReportThreshold)
      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          status: "hidden",
          moderationComment: "Автоматически скрыто по уникальным жалобам",
        },
      });
    return report;
  },
);
app.post(
  "/api/listings/:id/contact",
  { preHandler: auth },
  async (req: any) => {
    const listing = await prisma.listing.findFirst({
      where: {
        id: req.params.id,
        status: "published",
        communityId: req.identity.communityId,
      },
      include: {
        author: {
          include: {
            members: { where: { communityId: req.identity.communityId } },
          },
        },
      },
    });
    if (!listing || listing.authorId === req.identity.userId)
      throw new DomainError("CONTACT_NOT_ALLOWED", "Связь недоступна", 409);
    const preferences = listing.author.members[0] as any;
    if (!preferences?.allowDirectContact && !preferences?.notifyBuyerInterest)
      throw new DomainError(
        "CONTACT_DISABLED",
        "Автор отключил связь по объявлениям",
        409,
      );
    if (listing.author.username && preferences?.allowDirectContact)
      return {
        mode: "username",
        url: `https://t.me/${listing.author.username}`,
      };
    if (!preferences?.notifyBuyerInterest)
      throw new DomainError(
        "CONTACT_DISABLED",
        "Автор отключил уведомления об интересе",
        409,
      );
    await prisma.notification.create({
      data: {
        communityId: req.identity.communityId,
        userId: listing.authorId,
        type: "listing_interest",
        payload: { listingId: listing.id, buyerId: req.identity.userId },
      },
    });
    return { mode: "bot", message: "Продавец получит уведомление через бота" };
  },
);
app.post(
  "/api/listings/:id/images",
  {
    preHandler: auth,
    config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
  },
  async (req: any) => {
    const listing = await prisma.listing.findFirst({
      where: {
        id: req.params.id,
        communityId: req.identity.communityId,
        authorId: req.identity.userId,
        status: { in: ["draft", "changes_requested"] },
      },
    });
    if (!listing)
      throw new DomainError(
        "LISTING_NOT_EDITABLE",
        "Объявление нельзя редактировать",
        409,
      );
    const current = await prisma.listingImage.count({
      where: { listingId: listing.id },
    });
    const files = [];
    for await (const part of req.files()) {
      if (files.length + current >= config.MAX_LISTING_IMAGES)
        throw new DomainError("IMAGE_LIMIT", "Слишком много фотографий");
      const buffer = await part.toBuffer();
      const detected = await fileTypeFromBuffer(buffer);
      if (
        !detected ||
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ].includes(detected.mime)
      )
        throw new DomainError(
          "IMAGE_TYPE_INVALID",
          "Разрешены только растровые изображения",
        );
      const name = `${crypto.randomUUID()}.webp`;
      const output = await sharp(buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: 1920,
          height: 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
      await fs.writeFile(path.join(config.UPLOAD_DIR, name), output, {
        flag: "wx",
      });
      files.push(
        await prisma.listingImage.create({
          data: {
            listingId: listing.id,
            storageProvider: "local",
            storageKey: name,
            url: `/uploads/${name}`,
            sizeBytes: output.length,
            sortOrder: current + files.length,
          },
        }),
      );
    }
    return files;
  },
);
app.delete(
  "/api/listings/:id/images/:imageId",
  { preHandler: auth },
  async (req: any) => {
    const image = await prisma.listingImage.findFirst({
      where: {
        id: req.params.imageId,
        listing: {
          id: req.params.id,
          communityId: req.identity.communityId,
          authorId: req.identity.userId,
          status: { in: ["draft", "changes_requested"] },
        },
      },
    });
    if (!image)
      throw new DomainError("IMAGE_NOT_FOUND", "Изображение не найдено", 404);
    await prisma.listingImage.delete({ where: { id: image.id } });
    if (image.storageKey)
      await fs
        .unlink(path.join(config.UPLOAD_DIR, path.basename(image.storageKey)))
        .catch(() => {});
    return { ok: true };
  },
);

app.get(
  "/api/admin/dashboard",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) => {
    const c = req.identity.communityId;
    const [
      pending,
      reports,
      publishedDay,
      publishedWeek,
      activeUsers,
      banned,
      expiring,
      abuseOpen,
      top,
    ] = await Promise.all([
      prisma.listing.count({ where: { communityId: c, status: "pending" } }),
      prisma.report.count({ where: { communityId: c, status: "open" } }),
      prisma.listing.count({
        where: {
          communityId: c,
          publishedAt: { gte: new Date(Date.now() - 86400000) },
        },
      }),
      prisma.listing.count({
        where: {
          communityId: c,
          publishedAt: { gte: new Date(Date.now() - 604800000) },
        },
      }),
      prisma.communityMember.count({
        where: {
          communityId: c,
          user: { lastSeenAt: { gte: new Date(Date.now() - 2592000000) } },
        },
      }),
      prisma.communityMember.count({
        where: { communityId: c, enforcementStatus: "banned" },
      }),
      prisma.listing.count({
        where: {
          communityId: c,
          status: "published",
          expiresAt: { lte: new Date(Date.now() + 259200000) },
        },
      }),
      prisma.abuseEvent.count({ where: { communityId: c, status: "open" } }),
      prisma.listing.findMany({
        where: { communityId: c, status: "published" },
        orderBy: { viewCount: "desc" },
        take: 5,
      }),
    ]);
    return {
      pending,
      reports,
      publishedDay,
      publishedWeek,
      activeUsers,
      banned,
      expiring,
      abuseOpen,
      top,
    };
  },
);
app.get(
  "/api/admin/moderation",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) =>
    prisma.listing.findMany({
      where: {
        communityId: req.identity.communityId,
        status: req.query?.status || "pending",
      },
      include: { images: true, category: true, author: true, reports: true },
      orderBy: { createdAt: "asc" },
    }),
);
app.post(
  "/api/admin/listings/:id/transition",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) => {
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.id, communityId: req.identity.communityId },
    });
    if (!listing)
      throw new DomainError("LISTING_NOT_FOUND", "Объявление не найдено", 404);
    const to = req.body?.status;
    assertListingTransition(listing.status, to);
    if (["rejected", "changes_requested"].includes(to) && !req.body?.reason)
      throw new DomainError("REASON_REQUIRED", "Укажите причину");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.listing.update({
        where: { id: listing.id },
        data: {
          status: to,
          moderationComment: req.body?.reason,
          moderatedById: req.identity.userId,
          moderatedAt: new Date(),
          publishedAt: to === "published" ? new Date() : listing.publishedAt,
          expiresAt:
            to === "published"
              ? expiresAt(
                  (
                    await tx.community.findUniqueOrThrow({
                      where: { id: req.identity.communityId },
                    })
                  ).listingLifetimeDays,
                )
              : listing.expiresAt,
          requiresManualReview: false,
        },
      });
      await tx.moderationAction.create({
        data: {
          communityId: req.identity.communityId,
          moderatorId: req.identity.userId,
          listingId: listing.id,
          action: `listing_${to}`,
          reason: req.body?.reason,
        },
      });
      await tx.abuseEvent.updateMany({
        where: { listingId: listing.id, status: "open" },
        data: { status: "resolved", resolution: `listing_${to}`, reviewedById: req.identity.userId, reviewedAt: new Date() },
      });
      await tx.notification.create({
        data: {
          communityId: req.identity.communityId,
          userId: listing.authorId,
          type: `listing_${to}`,
          payload: { listingId: listing.id, reason: req.body?.reason },
        },
      });
      return updated;
    });
  },
);
app.get(
  "/api/admin/reports",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) =>
    prisma.report.findMany({
      where: {
        communityId: req.identity.communityId,
        status: req.query?.status || "open",
      },
      include: { listing: true, reporter: true },
      orderBy: { createdAt: "asc" },
    }),
);
app.get(
  "/api/admin/abuse",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) => prisma.abuseEvent.findMany({
    where: { communityId: req.identity.communityId, status: String(req.query?.status || "open") },
    include: {
      user: { select: { id: true, firstName: true, username: true, createdAt: true } },
      listing: { include: { category: true, images: { take: 1 } } },
      payment: { select: { id: true, amountStars: true, reviewStatus: true, riskScore: true, riskReasons: true } },
    },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }], take: 200,
  }),
);
app.post(
  "/api/admin/abuse/:id/resolve",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) => {
    const resolution = String(req.body?.resolution || "");
    if (!["approved", "false_positive", "confirmed", "blocked"].includes(resolution))
      throw new DomainError("ABUSE_RESOLUTION_INVALID", "Выберите результат проверки");
    return prisma.$transaction(async (tx) => {
      const event = await tx.abuseEvent.findFirst({ where: { id: req.params.id, communityId: req.identity.communityId, status: "open" } });
      if (!event) throw new DomainError("ABUSE_EVENT_NOT_FOUND", "Риск-событие не найдено", 404);
      if (event.paymentId)
        await tx.publicationPayment.update({ where: { id: event.paymentId }, data: { reviewStatus: ["approved", "false_positive"].includes(resolution) ? "approved" : "blocked" } });
      if (event.listingId && ["approved", "false_positive"].includes(resolution))
        await tx.listing.update({ where: { id: event.listingId }, data: { requiresManualReview: false } });
      const updated = await tx.abuseEvent.update({ where: { id: event.id }, data: {
        status: "resolved", resolution, reviewedById: req.identity.userId, reviewedAt: new Date(),
      } });
      await tx.moderationAction.create({ data: {
        communityId: req.identity.communityId, moderatorId: req.identity.userId,
        targetUserId: event.userId, listingId: event.listingId,
        action: "abuse_risk_resolved", reason: resolution, metadata: { abuseEventId: event.id, paymentId: event.paymentId },
      } });
      return updated;
    });
  },
);
app.post(
  "/api/admin/reports/:id/resolve",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.report.findFirst({
        where: {
          id: req.params.id,
          communityId: req.identity.communityId,
        },
      });
      if (!existing)
        throw new DomainError("REPORT_NOT_FOUND", "Жалоба не найдена", 404);
      const report = await tx.report.update({
        where: { id: existing.id },
        data: {
          status: req.body?.status || "resolved",
          resolution: req.body?.resolution,
          reviewedById: req.identity.userId,
          reviewedAt: new Date(),
        },
      });
      await tx.moderationAction.create({
        data: {
          communityId: req.identity.communityId,
          moderatorId: req.identity.userId,
          reportId: report.id,
          listingId: report.listingId,
          action: "report_resolved",
          reason: req.body?.resolution,
        },
      });
      return report;
    }),
);
app.get(
  "/api/admin/users",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) => {
    const search = String(req.query?.search || "").trim();
    const where: any = {
      communityId: req.identity.communityId,
      ...(search
        ? {
            user: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                {
                  username: {
                    contains: search.replace(/^@/, ""),
                    mode: "insensitive",
                  },
                },
              ],
            },
          }
        : {}),
    };
    const [members, total] = await prisma.$transaction([
      prisma.communityMember.findMany({
        where,
        include: {
          user: { include: { _count: { select: { listings: true } } } },
        },
        orderBy: { user: { lastSeenAt: "desc" } },
        take: Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100),
      }),
      prisma.communityMember.count({ where }),
    ]);
    return { items: members, total };
  },
);
app.patch(
  "/api/admin/users/:userId",
  { preHandler: requireRole(adminRoles) },
  async (req: any) => {
    const target = await prisma.communityMember.findUniqueOrThrow({
      where: {
        communityId_userId: {
          communityId: req.identity.communityId,
          userId: req.params.userId,
        },
      },
    });
    const role = req.body?.role;
    const status = req.body?.status;
    if (status && !["active", "restricted", "banned"].includes(status))
      throw new DomainError("ENFORCEMENT_STATUS_INVALID", "Неверный статус доступа");
    if (status && status !== "active" && target.role === "owner")
      throw new DomainError("OWNER_PROTECTED", "Сначала передайте права владельца", 409);
    if (["admin", "owner"].includes(role) && req.identity.role !== "owner")
      throw new DomainError(
        "OWNER_REQUIRED",
        "Только владелец назначает владельцев",
        403,
      );
    if (target.role === "owner" && role && role !== "owner") {
      const owners = await prisma.communityMember.count({
        where: { communityId: req.identity.communityId, role: "owner" },
      });
      if (owners <= 1)
        throw new DomainError(
          "LAST_OWNER",
          "Нельзя снять последнего владельца",
          409,
        );
    }
    return prisma.$transaction(async (tx) => {
      const member = await tx.communityMember.update({
        where: { id: target.id },
        data: {
          role,
          isMuted: req.body?.isMuted,
          mutedUntil: req.body?.mutedUntil && new Date(req.body.mutedUntil),
          ...(status ? { enforcementStatus: status === "active" ? "active" : status, enforcementReason: String(req.body?.reason || "").slice(0, 500) || null } : {}),
          ...(req.body?.restrictedUntil ? { restrictedUntil: new Date(req.body.restrictedUntil) } : status === "active" ? { restrictedUntil: null } : {}),
        },
      });
      await tx.moderationAction.create({
        data: {
          communityId: req.identity.communityId,
          moderatorId: req.identity.userId,
          targetUserId: target.userId,
          action: status === "banned" ? "user_banned" : "user_role_updated",
          metadata: req.body,
        },
      });
      return member;
    });
  },
);
app.get(
  "/api/admin/categories",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) =>
    prisma.category.findMany({
      where: { communityId: req.identity.communityId },
      orderBy: { sortOrder: "asc" },
    }),
);
app.post(
  "/api/admin/categories",
  { preHandler: requireRole(adminRoles) },
  async (req: any) =>
    prisma.category.create({
      data: {
        communityId: req.identity.communityId,
        name: req.body.name,
        slug: req.body.slug,
        icon: req.body.icon,
        parentId: req.body.parentId,
        sortOrder: req.body.sortOrder || 0,
      },
    }),
);
app.patch(
  "/api/admin/categories/:id",
  { preHandler: requireRole(adminRoles) },
  async (req: any) => {
    const category = await prisma.category.findFirst({
      where: { id: req.params.id, communityId: req.identity.communityId },
    });
    if (!category)
      throw new DomainError("CATEGORY_NOT_FOUND", "Категория не найдена", 404);
    const allowed = [
      "name",
      "slug",
      "icon",
      "parentId",
      "sortOrder",
      "isActive",
      "fieldSchema",
      "conditionEnabled",
    ];
    const data = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );
    return prisma.category.update({ where: { id: category.id }, data });
  },
);
app.get(
  "/api/admin/settings",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) => {
    const community = await prisma.community.findUnique({
      where: { id: req.identity.communityId },
    });
    return community
      ? {
          ...community,
          telegramChatId: String(community.telegramChatId),
          publicationChatId:
            community.publicationChatId === null
              ? null
              : String(community.publicationChatId),
        }
      : null;
  },
);
app.patch(
  "/api/admin/settings",
  { preHandler: requireRole(adminRoles) },
  async (req: any) => {
    const allowed = [
      "name",
      "description",
      "inviteUrl",
      "moderationEnabled",
      "remoderatePublishedEdits",
      "autoPublishEnabled",
      "publicationMode",
      "defaultCurrency",
      "defaultLocale",
      "maxActiveListingsPerUser",
      "maxImagesPerListing",
      "listingLifetimeDays",
      "autoHideReportThreshold",
      "rules",
      "prohibitedWords",
      "minMonthlyMessagesForFree",
      "publicationPriceStars",
      "allowPaidNonMembers",
      "abuseProtectionMode",
      "minQualifiedMessageChars",
      "maxLinksPerQualifiedMessage",
      "maxListingsPerDay",
      "duplicateWindowDays",
      "duplicateSimilarityPercent",
      "riskyListingThreshold",
      "maxPaidInvoicesPerDay",
    ];
    const data: any = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );
    if (typeof data.rules === "string") data.rules = data.rules.slice(0, 10000);
    if (typeof data.description === "string")
      data.description = data.description.trim().slice(0, 500);
    if (data.prohibitedWords !== undefined) {
      if (!Array.isArray(data.prohibitedWords) || data.prohibitedWords.length > 200)
        throw new DomainError("SETTINGS_INVALID", "Допустимо не более 200 запрещённых фраз");
      data.prohibitedWords = [...new Set(data.prohibitedWords.map((value: unknown) => String(value).trim().toLowerCase().slice(0, 80)).filter((value: string) => value.length >= 2))];
    }
    if (data.abuseProtectionMode !== undefined && !["off", "observe", "enforce"].includes(data.abuseProtectionMode))
      throw new DomainError("SETTINGS_INVALID", "Неверный режим защиты");
    const abuseRanges: Record<string, [number, number]> = {
      minQualifiedMessageChars: [1, 500], maxLinksPerQualifiedMessage: [0, 10],
      maxListingsPerDay: [1, 100], duplicateWindowDays: [1, 365],
      duplicateSimilarityPercent: [50, 100], riskyListingThreshold: [1, 100],
      maxPaidInvoicesPerDay: [1, 100],
    };
    for (const [key, [minimum, maximum]] of Object.entries(abuseRanges))
      if (data[key] !== undefined && (!Number.isInteger(data[key]) || data[key] < minimum || data[key] > maximum))
        throw new DomainError("SETTINGS_INVALID", `${key}: допустимо от ${minimum} до ${maximum}`);
    if (
      data.minMonthlyMessagesForFree !== undefined &&
      (!Number.isInteger(data.minMonthlyMessagesForFree) ||
        data.minMonthlyMessagesForFree < 0 ||
        data.minMonthlyMessagesForFree > 10000)
    )
      throw new DomainError(
        "SETTINGS_INVALID",
        "Количество сообщений должно быть от 0 до 10000",
      );
    if (
      data.publicationPriceStars !== undefined &&
      (!Number.isInteger(data.publicationPriceStars) ||
        data.publicationPriceStars < 1 ||
        data.publicationPriceStars > 10000)
    )
      throw new DomainError(
        "SETTINGS_INVALID",
        "Цена должна быть от 1 до 10000 Stars",
      );
    if (data.publicationPriceStars !== undefined) {
      const platformSettings = await prisma.platformSetting.findUnique({
        where: { id: "global" },
      });
      if (
        platformSettings &&
        data.publicationPriceStars < platformSettings.minimumPublicationStars
      )
        throw new DomainError(
          "PUBLICATION_PRICE_BELOW_PLATFORM_MINIMUM",
          `Минимальная цена платформы — ${platformSettings.minimumPublicationStars} Stars`,
        );
    }
    const result = await prisma.community.update({
      where: { id: req.identity.communityId },
      data,
    });
    await prisma.moderationAction.create({
      data: {
        communityId: req.identity.communityId,
        moderatorId: req.identity.userId,
        action: "settings_updated",
        metadata: data,
      },
    });
    return {
      ...result,
      telegramChatId: String(result.telegramChatId),
      publicationChatId:
        result.publicationChatId === null
          ? null
          : String(result.publicationChatId),
    };
  },
);
app.get(
  "/api/admin/audit-log",
  { preHandler: requireRole(privilegedRoles) },
  async (req: any) =>
    prisma.moderationAction.findMany({
      where: { communityId: req.identity.communityId },
      include: { moderator: { select: { firstName: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
);

const close = async () => {
  await app.close();
  await redis.quit();
  await prisma.$disconnect();
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 3001) });

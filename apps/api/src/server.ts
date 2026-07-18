import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Redis } from "ioredis";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
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
} from "@board/core";
import { loadConfig } from "./config.js";
import { telegramMembership, validateInitData } from "./auth.js";

const config = loadConfig();
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
await app.register(staticPlugin, {
  root: config.UPLOAD_DIR,
  prefix: "/uploads/",
  decorateReply: false,
});

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
app.setErrorHandler((unknownError, req, reply) => {
  const err = unknownError as Error & { statusCode?: number };
  const status: number =
    err instanceof DomainError ? err.statusCode : (err.statusCode ?? 500);
  if (status >= 500) req.log.error(err);
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

app.get("/health", async () => {
  await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  return { status: "ok" };
});
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
  };
});

app.post(
  "/api/platform/organizations",
  { preHandler: platformAuth },
  async (req: any) => {
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
    const [accounts, transactions] = await prisma.$transaction([
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
        paidOut: balances.liability_paid || 0,
      },
      transactions,
    };
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
    where: { id: req.params.id, authorId: req.identity.userId },
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
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: { category: true, images: { select: { id: true } } },
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
        authorId: req.identity.userId,
        status: "draft",
      },
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
    await prisma.publicationPayment.upsert({
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
      },
    });
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
    where: { authorId: req.identity.userId, status: req.query?.status },
    include: { images: { take: 1 } },
    orderBy: { updatedAt: "desc" },
  }),
);
app.get("/api/my/favorites", { preHandler: auth }, async (req: any) =>
  prisma.favorite.findMany({
    where: { userId: req.identity.userId, listing: { status: "published" } },
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
        where: { communityId: c, user: { status: "banned" } },
      }),
      prisma.listing.count({
        where: {
          communityId: c,
          status: "published",
          expiresAt: { lte: new Date(Date.now() + 259200000) },
        },
      }),
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
      if (status)
        await tx.user.update({
          where: { id: target.userId },
          data: { status },
        });
      const member = await tx.communityMember.update({
        where: { id: target.id },
        data: {
          role,
          isMuted: req.body?.isMuted,
          mutedUntil: req.body?.mutedUntil && new Date(req.body.mutedUntil),
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
    ];
    const data: any = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)),
    );
    if (typeof data.rules === "string") data.rules = data.rules.slice(0, 10000);
    if (typeof data.description === "string")
      data.description = data.description.trim().slice(0, 500);
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

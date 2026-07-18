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
declare module "fastify" {
  interface FastifyRequest {
    identity?: Identity;
  }
}
const error = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});
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
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    if (!user || user.status !== "active")
      throw new DomainError("ACCESS_DENIED", "Доступ ограничен", 403);
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
    status = await telegramMembership(config, Number(identity.telegramUserId));
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
    await redis.set(
      replay,
      "1",
      "EX",
      config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    );
    const community = await prisma.community.findUniqueOrThrow({
      where: { telegramChatId: config.TELEGRAM_GROUP_ID },
    });
    const status = await telegramMembership(config, verified.user.id);
    if (
      !["creator", "administrator", "member", "restricted"].includes(status) &&
      !community.allowPaidNonMembers
    )
      return reply.status(403).send({
        ...error(
          "NOT_GROUP_MEMBER",
          "Эта доска объявлений доступна только участникам группы.",
        ),
        inviteUrl: config.TELEGRAM_GROUP_INVITE_URL,
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
  return prisma.listing.findMany({
    where,
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      category: true,
      author: { select: { firstName: true, username: true } },
    },
    orderBy: order,
    take: Math.min(Number(q.limit) || 30, 100),
  });
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
        condition: b.condition || "good",
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
    const community = await prisma.community.findUniqueOrThrow({
      where: { id: req.identity.communityId },
    });
    const payload = `publication:${listing.id}:${crypto.randomUUID()}`;
    await prisma.publicationPayment.upsert({
      where: { listingId: listing.id },
      update: {
        amountStars: community.publicationPriceStars,
        invoicePayload: payload,
        status: "pending",
      },
      create: {
        communityId: community.id,
        userId: req.identity.userId,
        listingId: listing.id,
        amountStars: community.publicationPriceStars,
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
      where: { id: req.params.id, status: "published" },
      include: { author: true },
    });
    if (!listing || listing.authorId === req.identity.userId)
      throw new DomainError("CONTACT_NOT_ALLOWED", "Связь недоступна", 409);
    if (listing.author.username)
      return {
        mode: "username",
        url: `https://t.me/${listing.author.username}`,
      };
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
      const report = await tx.report.update({
        where: { id: req.params.id },
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
    const members = await prisma.communityMember.findMany({
      where: { communityId: req.identity.communityId },
      include: {
        user: { include: { _count: { select: { listings: true } } } },
      },
      orderBy: { user: { lastSeenAt: "desc" } },
    });
    return members.map((member) => ({
      ...member,
      user: {
        ...member.user,
        telegramUserId: String(member.user.telegramUserId),
      },
    }));
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
  async (req: any) =>
    prisma.category.update({ where: { id: req.params.id }, data: req.body }),
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

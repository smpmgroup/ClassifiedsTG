import { Telegraf, Markup } from "telegraf";
import { prisma, assertListingTransition } from "@board/core";
const tokenValue = process.env.TELEGRAM_BOT_TOKEN;
const appUrlValue = process.env.TELEGRAM_MINI_APP_URL;
const usernameValue = process.env.TELEGRAM_BOT_USERNAME;
if (!tokenValue || !appUrlValue || !usernameValue)
  throw new Error(
    "TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_MINI_APP_URL are required",
  );
const token: string = tokenValue;
const appUrl: string = appUrlValue;
const botUsername: string = usernameValue;
const bot = new Telegraf(token);
const privateBoard = () =>
  Markup.inlineKeyboard([Markup.button.webApp("Открыть доску", appUrl)]);
const publicBoard = () =>
  Markup.inlineKeyboard([
    Markup.button.url(
      "Открыть доску",
      `https://t.me/${botUsername}?start=board`,
    ),
  ]);
bot.start((ctx) =>
  ctx.reply("Добро пожаловать на доску объявлений сообщества.", privateBoard()),
);
bot.command("board", (ctx) =>
  ctx.reply(
    "Открыть объявления:",
    ctx.chat.type === "private" ? privateBoard() : publicBoard(),
  ),
);
bot.command("help", (ctx) =>
  ctx.reply(
    "/board — открыть доску\n/myads — мои объявления\n/rules — правила",
  ),
);
bot.command("rules", async (ctx) => {
  const c = await prisma.community.findFirst({ where: { isActive: true } });
  await ctx.reply(c?.rules || "Правила сообщества пока не опубликованы.");
});
bot.command("myads", (ctx) =>
  ctx.reply(
    "Ваши объявления доступны в профиле Mini App.",
    Markup.inlineKeyboard([
      Markup.button.webApp("Мои объявления", `${appUrl}?screen=my-listings`),
    ]),
  ),
);
const roles = new Set(["moderator", "admin", "owner"]);
async function moderator(telegramId: number, communityId: string) {
  return prisma.communityMember.findFirst({
    where: {
      communityId,
      user: { telegramUserId: BigInt(telegramId), status: "active" },
      role: { in: [...roles] as any },
    },
  });
}
bot.action(/^mod:(approve|changes|reject|ban):(.+)$/, async (ctx) => {
  const [, action, id] = ctx.match;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { author: true },
  });
  if (!listing || !(await moderator(ctx.from.id, listing.communityId))) {
    await ctx.answerCbQuery("Недостаточно прав", { show_alert: true });
    return;
  }
  if (action === "ban") {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: listing.authorId },
        data: { status: "banned" },
      }),
      prisma.moderationAction.create({
        data: {
          communityId: listing.communityId,
          moderatorId: (await moderator(ctx.from.id, listing.communityId))!
            .userId,
          targetUserId: listing.authorId,
          listingId: id,
          action: "user_banned",
        },
      }),
    ]);
    await ctx.answerCbQuery("Пользователь заблокирован");
    return;
  }
  if (action === "changes" || action === "reject") {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        [
          "Запрещённый товар",
          "Недостаточно информации",
          "Некорректная категория",
          "Подозрение на мошенничество",
          "Дубликат",
          "Некачественные фотографии",
          "Нарушение правил",
        ].map((r, i) => ({
          text: r,
          callback_data: `reason:${action}:${i}:${id}`,
        })),
      ],
    });
    await ctx.answerCbQuery("Выберите причину");
    return;
  }
  assertListingTransition(listing.status, "published");
  const mod = await moderator(ctx.from.id, listing.communityId);
  await prisma.$transaction([
    prisma.listing.update({
      where: { id },
      data: {
        status: "published",
        publishedAt: new Date(),
        moderatedAt: new Date(),
        moderatedById: mod!.userId,
      },
    }),
    prisma.moderationAction.create({
      data: {
        communityId: listing.communityId,
        moderatorId: mod!.userId,
        listingId: id,
        action: "listing_approved",
      },
    }),
    prisma.notification.create({
      data: {
        communityId: listing.communityId,
        userId: listing.authorId,
        type: "listing_published",
        payload: { listingId: id },
      },
    }),
  ]);
  await ctx
    .editMessageCaption(
      `✅ Одобрено модератором ${ctx.from.first_name}\n${new Date().toLocaleString("ru")}`,
    )
    .catch(() =>
      ctx.editMessageText(`✅ Одобрено модератором ${ctx.from.first_name}`),
    );
  await ctx.answerCbQuery("Одобрено");
});
const reasons = [
  "Запрещённый товар",
  "Недостаточно информации",
  "Некорректная категория",
  "Подозрение на мошенничество",
  "Дубликат",
  "Некачественные фотографии",
  "Нарушение правил",
];
bot.action(/^reason:(changes|reject):(\d+):(.+)$/, async (ctx) => {
  const [, kind, index, id] = ctx.match;
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return ctx.answerCbQuery("Уже обработано");
  const mod = await moderator(ctx.from.id, listing.communityId);
  if (!mod) return ctx.answerCbQuery("Недостаточно прав", { show_alert: true });
  const to = kind === "changes" ? "changes_requested" : "rejected";
  assertListingTransition(listing.status, to);
  const reason = reasons[Number(index)];
  await prisma.$transaction([
    prisma.listing.update({
      where: { id },
      data: {
        status: to,
        moderationComment: reason,
        moderatedAt: new Date(),
        moderatedById: mod.userId,
      },
    }),
    prisma.moderationAction.create({
      data: {
        communityId: listing.communityId,
        moderatorId: mod.userId,
        listingId: id,
        action: kind === "changes" ? "changes_requested" : "listing_rejected",
        reason,
      },
    }),
    prisma.notification.create({
      data: {
        communityId: listing.communityId,
        userId: listing.authorId,
        type: `listing_${to}`,
        payload: { listingId: id, reason },
      },
    }),
  ]);
  await ctx.editMessageText(
    `${to === "rejected" ? "❌ Отклонено" : "✏️ На доработку"}: ${reason}\nМодератор: ${ctx.from.first_name}`,
  );
  await ctx.answerCbQuery("Решение сохранено");
});
async function poll() {
  const pending = await prisma.notification.findMany({
    where: { status: "pending" },
    include: { user: true },
    take: 20,
  });
  for (const n of pending) {
    try {
      if (n.type === "moderation_pending")
        await sendModerationCard((n.payload as any).listingId);
      else if (n.user)
        await bot.telegram.sendMessage(
          n.user.telegramUserId.toString(),
          notificationText(n.type, n.payload as any),
          Markup.inlineKeyboard([Markup.button.webApp("Открыть", appUrl)]),
        );
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } catch (e) {
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: "failed",
          attempts: { increment: 1 },
          lastError: String((e as Error).message).slice(0, 500),
        },
      });
    }
  }
}
async function sendModerationCard(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      author: true,
      category: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });
  if (!listing || listing.status !== "pending") return;
  const active = await prisma.listing.count({
    where: { authorId: listing.authorId, status: "published" },
  });
  const rejected = await prisma.listing.count({
    where: { authorId: listing.authorId, status: "rejected" },
  });
  const author = listing.author.username
    ? `@${listing.author.username}`
    : listing.author.firstName;
  const price = listing.price
    ? `${listing.price} ${listing.currency}`
    : listing.priceType;
  const text = `🕵️ Объявление на проверку\n\n#${listing.id}\nАвтор: ${author}\nКатегория: ${listing.category.name}\nНазвание: ${listing.title}\nЦена: ${price}\nГород: ${listing.locationText || "—"}\n\n${listing.description.slice(0, 1000)}\n\nАктивных: ${active} · Отклонено: ${rejected}`;
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Одобрить", `mod:approve:${listing.id}`),
      Markup.button.callback("✏️ Доработать", `mod:changes:${listing.id}`),
    ],
    [
      Markup.button.callback("❌ Отклонить", `mod:reject:${listing.id}`),
      Markup.button.callback("🚫 Блокировать", `mod:ban:${listing.id}`),
    ],
    [Markup.button.url("🔍 Открыть", `${appUrl}?listing=${listing.id}`)],
  ]);
  const moderators = await prisma.communityMember.findMany({
    where: {
      communityId: listing.communityId,
      role: { in: ["moderator", "admin", "owner"] },
      user: { status: "active" },
    },
    include: { user: true },
  });
  let sent = 0;
  for (const member of moderators) {
    try {
      const chatId = member.user.telegramUserId.toString();
      if (listing.images[0]?.url)
        await bot.telegram.sendPhoto(
          chatId,
          new URL(listing.images[0].url, appUrl).toString(),
          { caption: text, ...keyboard.reply_markup },
        );
      else await bot.telegram.sendMessage(chatId, text, keyboard);
      sent++;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "moderator_dm_failed",
          moderatorId: member.user.id,
          error: (error as Error).message,
        }),
      );
    }
  }
  if (!sent && process.env.TELEGRAM_MODERATION_CHAT_ID) {
    await bot.telegram.sendMessage(
      process.env.TELEGRAM_MODERATION_CHAT_ID,
      text,
      keyboard,
    );
    sent++;
  }
  if (!sent) throw new Error("No moderator can receive direct messages");
}
function notificationText(type: string, p: any) {
  const reason = p?.reason ? `\nПричина: ${p.reason}` : "";
  return (
    ((
      {
        listing_pending: "Ваше объявление отправлено на проверку.",
        listing_published: "Ваше объявление одобрено.",
        listing_rejected: "Ваше объявление отклонено.",
        listing_changes_requested: "Ваше объявление требует изменений.",
        listing_interest: "Вашим объявлением заинтересовались.",
      } as any
    )[type] || "Новое уведомление") + reason
  );
}
bot.on("pre_checkout_query", async (ctx) => {
  const payment = await prisma.publicationPayment.findUnique({
    where: { invoicePayload: ctx.preCheckoutQuery.invoice_payload },
  });
  const valid =
    payment &&
    payment.status === "pending" &&
    payment.userId ===
      (
        await prisma.user.findUnique({
          where: { telegramUserId: BigInt(ctx.from.id) },
        })
      )?.id &&
    payment.amountStars === ctx.preCheckoutQuery.total_amount;
  await ctx.answerPreCheckoutQuery(
    Boolean(valid),
    valid ? undefined : "Счёт недействителен или уже оплачен",
  );
});
bot.on("message", async (ctx) => {
  if ("successful_payment" in ctx.message) {
    const paid = ctx.message.successful_payment;
    const payment = await prisma.publicationPayment.findUnique({
      where: { invoicePayload: paid.invoice_payload },
    });
    if (
      payment &&
      paid.currency === "XTR" &&
      paid.total_amount === payment.amountStars
    )
      await prisma.$transaction([
        prisma.publicationPayment.update({
          where: { id: payment.id },
          data: {
            status: "paid",
            paidAt: new Date(),
            telegramPaymentChargeId: paid.telegram_payment_charge_id,
          },
        }),
        prisma.listing.update({
          where: { id: payment.listingId },
          data: { paymentStatus: "paid" },
        }),
      ]);
    return;
  }
  if (ctx.chat.type === "private") return;
  const community = await prisma.community.findUnique({
    where: { telegramChatId: BigInt(ctx.chat.id) },
  });
  if (!community || !ctx.from) return;
  const user = await prisma.user.upsert({
    where: { telegramUserId: BigInt(ctx.from.id) },
    update: {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      lastSeenAt: new Date(),
    },
    create: {
      telegramUserId: BigInt(ctx.from.id),
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    },
  });
  await prisma.messageActivity.upsert({
    where: {
      communityId_userId_month: {
        communityId: community.id,
        userId: user.id,
        month: new Date().toISOString().slice(0, 7),
      },
    },
    update: { messageCount: { increment: 1 } },
    create: {
      communityId: community.id,
      userId: user.id,
      month: new Date().toISOString().slice(0, 7),
      messageCount: 1,
    },
  });
});
const timer = setInterval(() => void poll(), 5000);
bot.launch();
process.once("SIGTERM", () => {
  clearInterval(timer);
  bot.stop("SIGTERM");
  void prisma.$disconnect();
});

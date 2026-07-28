import { Telegraf, Markup } from "telegraf";
import { Redis } from "ioredis";
import crypto from "node:crypto";
import {
  prisma,
  assertListingTransition,
  categoryTaxonomies,
  recordPaidPublicationLedger,
  qualifyCommunityMessage,
} from "@board/core";
const tokenValue = process.env.TELEGRAM_BOT_TOKEN;
const appUrlValue = process.env.TELEGRAM_MINI_APP_URL;
const usernameValue = process.env.TELEGRAM_BOT_USERNAME;
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET || "";
if (!tokenValue || !appUrlValue || !usernameValue || !accessTokenSecret)
  throw new Error(
    "TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_MINI_APP_URL and ACCESS_TOKEN_SECRET are required",
  );
const token: string = tokenValue;
const appUrl: string = appUrlValue;
const botUsername: string = usernameValue;
const bot = new Telegraf(token);
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: 2,
});
const supportedLocales = new Set([
  "en",
  "es",
  "ca",
  "ru",
  "uk",
  "fr",
  "de",
  "it",
  "pt",
]);
type BotLocale = "en" | "es" | "ca" | "ru" | "uk" | "fr" | "de" | "it" | "pt";
const normalizeLocale = (
  value?: string | null,
  fallback: BotLocale = "en",
): BotLocale => {
  const locale = String(value || "")
    .toLowerCase()
    .slice(0, 2);
  return supportedLocales.has(locale) ? (locale as BotLocale) : fallback;
};
const botCopy: Record<BotLocale, Record<string, string>> = {
  en: {
    open: "Open board",
    owner: "Community admin dashboard",
    board: "Community marketplace",
    intro:
      "Publish and discover trusted community listings in one place. The button opens the board directly inside Telegram.",
    boardCommand: "Open community marketplace",
    rulesCommand: "Community rules",
    installCommand: "Install board button (admins)",
    installed:
      "The board button was published but could not be pinned. Give the bot permission to pin messages and run /install_board again.",
    choose: "Choose a community board:",
    listings: "Open listings:",
    privateIntro: "Welcome to the community marketplace.",
    myAds: "My listings",
  },
  es: {
    open: "Abrir tablón",
    owner: "Panel de administración",
    board: "Tablón de la comunidad",
    intro:
      "Publica y descubre anuncios de confianza en un solo lugar. El botón abre el tablón directamente en Telegram.",
    boardCommand: "Abrir tablón de anuncios",
    rulesCommand: "Reglas de la comunidad",
    installCommand: "Instalar botón (administradores)",
    installed:
      "El botón se publicó, pero no se pudo fijar. Da permiso para fijar mensajes y ejecuta /install_board de nuevo.",
    choose: "Elige un tablón:",
    listings: "Abrir anuncios:",
    privateIntro: "Bienvenido al tablón de la comunidad.",
    myAds: "Mis anuncios",
  },
  ca: {
    open: "Obre el tauler",
    owner: "Panell d'administració",
    board: "Tauler de la comunitat",
    intro:
      "Publica i descobreix anuncis de confiança en un sol lloc. El botó obre el tauler directament a Telegram.",
    boardCommand: "Obre el tauler d'anuncis",
    rulesCommand: "Normes de la comunitat",
    installCommand: "Instal·la el botó (administradors)",
    installed:
      "El botó s'ha publicat però no s'ha pogut fixar. Dona permís per fixar missatges i torna a executar /install_board.",
    choose: "Tria un tauler:",
    listings: "Obre els anuncis:",
    privateIntro: "Benvingut al tauler de la comunitat.",
    myAds: "Els meus anuncis",
  },
  ru: {
    open: "Открыть доску",
    owner: "Кабинет администратора",
    board: "Доска объявлений сообщества",
    intro:
      "Публикуйте и находите объявления участников в одном месте. Кнопка открывает доску сразу внутри Telegram.",
    boardCommand: "Открыть доску объявлений",
    rulesCommand: "Правила сообщества",
    installCommand: "Установить кнопку доски (для админов)",
    installed:
      "Кнопка опубликована, но её не удалось закрепить. Выдайте боту право закреплять сообщения и повторите /install_board.",
    choose: "Выберите доску сообщества:",
    listings: "Открыть объявления:",
    privateIntro: "Добро пожаловать на доску объявлений сообщества.",
    myAds: "Мои объявления",
  },
  uk: {
    open: "Відкрити дошку",
    owner: "Кабінет адміністратора",
    board: "Дошка оголошень спільноти",
    intro:
      "Публікуйте та знаходьте оголошення учасників в одному місці. Кнопка відкриває дошку прямо в Telegram.",
    boardCommand: "Відкрити дошку оголошень",
    rulesCommand: "Правила спільноти",
    installCommand: "Встановити кнопку (для адміністраторів)",
    installed:
      "Кнопку опубліковано, але не закріплено. Надайте право закріплювати повідомлення та повторіть /install_board.",
    choose: "Оберіть дошку спільноти:",
    listings: "Відкрити оголошення:",
    privateIntro: "Ласкаво просимо на дошку спільноти.",
    myAds: "Мої оголошення",
  },
  fr: {
    open: "Ouvrir le tableau",
    owner: "Espace administrateur",
    board: "Marché de la communauté",
    intro:
      "Publiez et découvrez les annonces de la communauté. Le bouton ouvre directement le tableau dans Telegram.",
    boardCommand: "Ouvrir le marché",
    rulesCommand: "Règles de la communauté",
    installCommand: "Installer le bouton (admins)",
    installed:
      "Le bouton a été publié mais n'a pas pu être épinglé. Autorisez le bot à épingler puis relancez /install_board.",
    choose: "Choisissez une communauté :",
    listings: "Ouvrir les annonces :",
    privateIntro: "Bienvenue sur le marché de la communauté.",
    myAds: "Mes annonces",
  },
  de: {
    open: "Pinnwand öffnen",
    owner: "Community-Verwaltung",
    board: "Community-Marktplatz",
    intro:
      "Veröffentliche und entdecke vertrauenswürdige Anzeigen. Der Button öffnet die Pinnwand direkt in Telegram.",
    boardCommand: "Marktplatz öffnen",
    rulesCommand: "Community-Regeln",
    installCommand: "Pinnwand-Button installieren (Admins)",
    installed:
      "Der Button wurde veröffentlicht, aber nicht angeheftet. Erteile die Berechtigung und führe /install_board erneut aus.",
    choose: "Community auswählen:",
    listings: "Anzeigen öffnen:",
    privateIntro: "Willkommen auf dem Community-Marktplatz.",
    myAds: "Meine Anzeigen",
  },
  it: {
    open: "Apri bacheca",
    owner: "Area amministratore",
    board: "Mercatino della community",
    intro:
      "Pubblica e scopri annunci affidabili. Il pulsante apre la bacheca direttamente in Telegram.",
    boardCommand: "Apri mercatino",
    rulesCommand: "Regole della community",
    installCommand: "Installa pulsante (amministratori)",
    installed:
      "Il pulsante è stato pubblicato ma non fissato. Concedi il permesso e ripeti /install_board.",
    choose: "Scegli una community:",
    listings: "Apri annunci:",
    privateIntro: "Benvenuto nel mercatino della community.",
    myAds: "I miei annunci",
  },
  pt: {
    open: "Abrir quadro",
    owner: "Painel de administração",
    board: "Mercado da comunidade",
    intro:
      "Publique e descubra anúncios de confiança. O botão abre o quadro diretamente no Telegram.",
    boardCommand: "Abrir mercado",
    rulesCommand: "Regras da comunidade",
    installCommand: "Instalar botão (administradores)",
    installed:
      "O botão foi publicado, mas não foi afixado. Dê permissão e execute /install_board novamente.",
    choose: "Escolha uma comunidade:",
    listings: "Abrir anúncios:",
    privateIntro: "Bem-vindo ao mercado da comunidade.",
    myAds: "Meus anúncios",
  },
};
const bt = (locale: string | null | undefined, key: string) =>
  botCopy[normalizeLocale(locale)][key] || botCopy.en[key] || key;
const mediaUrl = (imageId: string) => {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ scope: "media", imageId, iat: now, exp: now + 3600 })}`;
  const signature = crypto
    .createHmac("sha256", accessTokenSecret)
    .update(body)
    .digest("base64url");
  const url = new URL(`/api/media/${imageId}`, appUrl);
  url.searchParams.set("token", `${body}.${signature}`);
  return url.toString();
};
const roles = new Set(["moderator", "admin", "owner"]);
const boardUrl = (communitySlug?: string, screen?: string) => {
  const url = new URL(appUrl);
  if (screen === "admin") url.pathname = "/admin";
  if (screen === "my-listings") url.pathname = "/profile";
  if (communitySlug) url.searchParams.set("community", communitySlug);
  return url.toString();
};
const privateBoard = (
  communitySlug?: string,
  screen?: string,
  locale?: string,
) =>
  Markup.inlineKeyboard([
    Markup.button.webApp(bt(locale, "open"), boardUrl(communitySlug, screen)),
  ]);
const platformUrl = () => {
  const url = new URL(appUrl);
  url.searchParams.set("mode", "platform");
  return url.toString();
};
const platformBoard = (locale?: string) =>
  Markup.inlineKeyboard([
    Markup.button.webApp(bt(locale, "owner"), platformUrl()),
  ]);
const confirmedWebLogin = (rawToken: string, platformOwner = false) => {
  // Keep the one-time token in the path: some Telegram → external-browser
  // handoffs discard both fragments and query parameters.
  const url = new URL(
    platformOwner
      ? `/api/auth/platform/web/complete/${rawToken}`
      : `/login/${rawToken}`,
    appUrl,
  );
  return Markup.inlineKeyboard([
    Markup.button.url(
      platformOwner ? "Продолжить вход" : "Открыть кабинет администратора",
      url.toString(),
    ),
  ]);
};
const publicBoard = (communitySlug: string, locale?: string) =>
  Markup.inlineKeyboard([
    Markup.button.url(
      `📋 ${bt(locale, "open")}`,
      `https://t.me/${botUsername}?startapp=community_${communitySlug}`,
    ),
  ]);
const groupCommands = (locale?: string) => [
  { command: "board", description: bt(locale, "boardCommand") },
  { command: "rules", description: bt(locale, "rulesCommand") },
  { command: "install_board", description: bt(locale, "installCommand") },
];

async function installGroupBoardEntry(
  ctx: any,
  community: { name: string; slug: string; defaultLocale?: string },
) {
  const locale = normalizeLocale(community.defaultLocale);
  await ctx.telegram
    .setMyCommands(groupCommands(locale), {
      scope: { type: "chat", chat_id: ctx.chat.id },
    })
    .catch((error: unknown) =>
      console.warn("Unable to install group bot commands", error),
    );
  const entry = await ctx.reply(
    `📋 ${bt(locale, "board")} «${community.name}»\n\n${bt(locale, "intro")}`,
    publicBoard(community.slug, locale),
  );
  const pinned = await ctx.telegram
    .pinChatMessage(ctx.chat.id, entry.message_id, {
      disable_notification: true,
    })
    .then(() => true)
    .catch((error: unknown) => {
      console.warn("Unable to pin group board entry", error);
      return false;
    });
  if (!pinned) await ctx.reply(bt(locale, "installed"));
  return pinned;
}
const categorySlug = (name: string, index: number) =>
  name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "") || `category-${index}`;

async function claimCommunityConnection(ctx: any, rawToken: string) {
  if (ctx.chat.type === "private")
    return ctx.reply("Добавьте бота именно в Telegram-группу.");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const intent = await prisma.communityConnectionIntent.findUnique({
    where: { tokenHash },
    include: { requestedBy: true, organization: true },
  });
  if (!intent || intent.status !== "pending" || intent.expiresAt <= new Date())
    return ctx.reply(
      "Ссылка подключения недействительна или истекла. Создайте новую в кабинете.",
    );
  if (intent.requestedBy.telegramUserId !== BigInt(ctx.from.id))
    return ctx.reply(
      "Эта ссылка создана другим пользователем. Войдите в свой кабинет.",
    );
  const requesterMembership = await ctx.telegram.getChatMember(
    ctx.chat.id,
    ctx.from.id,
  );
  if (!["creator", "administrator"].includes(requesterMembership.status))
    return ctx.reply(
      "Подключить группу может только её владелец или администратор.",
    );
  const existing = await prisma.community.findUnique({
    where: { telegramChatId: BigInt(ctx.chat.id) },
  });
  if (existing) {
    if (existing.organizationId !== intent.organizationId)
      return ctx.reply(
        "Эта группа уже подключена к другому кабинету. Перенос должен выполнить её текущий администратор.",
      );
    if (existing.deletionScheduledFor)
      return ctx.reply(
        "Для этой доски запрошено удаление. Сначала отмените его в кабинете владельца.",
      );
    const botMembership = await ctx.telegram.getChatMember(
      ctx.chat.id,
      ctx.botInfo.id,
    );
    const isAdministrator = botMembership.status === "administrator";
    if (!isAdministrator)
      return ctx.reply(
        "Для подключения назначьте бота администратором группы, затем повторите подключение из кабинета.",
      );
    await prisma.communityConnectionIntent.update({
      where: { id: intent.id },
      data: {
        status: "claimed",
        claimedChatId: BigInt(ctx.chat.id),
        communityId: existing.id,
      },
    });
    await prisma.community.update({
      where: { id: existing.id },
      data: {
        tenantStatus: "active",
        isActive: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        botStatus: botMembership.status,
        botIsAdministrator: isAdministrator,
        botCanDeleteMessages:
          isAdministrator &&
          Boolean((botMembership as any).can_delete_messages),
        botCanRestrictMembers:
          isAdministrator &&
          Boolean((botMembership as any).can_restrict_members),
        botCanInviteUsers:
          isAdministrator && Boolean((botMembership as any).can_invite_users),
        botLastCheckedAt: new Date(),
      },
    });
    await prisma.auditEvent.create({
      data: {
        communityId: existing.id,
        actorId: intent.requestedById,
        scope: "onboarding",
        action: "community_reconnected",
        targetType: "Community",
        targetId: existing.id,
      },
    });
    await ctx.reply("Эта группа уже подключена. Обновляю точку входа в доску.");
    await installGroupBoardEntry(ctx, existing);
    return;
  }
  let inviteUrl =
    "username" in ctx.chat && ctx.chat.username
      ? `https://t.me/${ctx.chat.username}`
      : "";
  if (!inviteUrl)
    inviteUrl = await ctx.telegram
      .exportChatInviteLink(ctx.chat.id)
      .catch(() => `https://t.me/${botUsername}`);
  const botMembership = await ctx.telegram.getChatMember(
    ctx.chat.id,
    ctx.botInfo.id,
  );
  const botIsAdministrator = botMembership.status === "administrator";
  if (!botIsAdministrator)
    return ctx.reply(
      "Боту нужны права администратора. Выдайте их и запустите подключение ещё раз.",
    );
  const chatId = BigInt(ctx.chat.id);
  const slug = `telegram-${chatId.toString().replace("-", "")}`;
  const community = await prisma.$transaction(async (tx) => {
    const claimed = await tx.communityConnectionIntent.updateMany({
      where: {
        id: intent.id,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      data: { status: "claiming", claimedChatId: chatId },
    });
    if (claimed.count !== 1)
      throw new Error("connection intent already claimed");
    const created = await tx.community.create({
      data: {
        organizationId: intent.organizationId,
        telegramChatId: chatId,
        name: ctx.chat.title || intent.organization.name,
        slug,
        inviteUrl,
        defaultLocale: normalizeLocale(ctx.from.language_code),
        tenantStatus: "active",
        connectedAt: new Date(),
        botStatus: botMembership.status,
        botIsAdministrator,
        botCanDeleteMessages:
          botIsAdministrator &&
          Boolean((botMembership as any).can_delete_messages),
        botCanRestrictMembers:
          botIsAdministrator &&
          Boolean((botMembership as any).can_restrict_members),
        botCanInviteUsers:
          botIsAdministrator &&
          Boolean((botMembership as any).can_invite_users),
        botLastCheckedAt: new Date(),
      },
    });
    await tx.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: created.id,
          userId: intent.requestedById,
        },
      },
      update: {
        role: "owner",
        telegramMembershipStatus: requesterMembership.status,
      },
      create: {
        communityId: created.id,
        userId: intent.requestedById,
        role: "owner",
        telegramMembershipStatus: requesterMembership.status,
        membershipCheckedAt: new Date(),
      },
    });
    for (const [index, taxonomy] of categoryTaxonomies.entries())
      await tx.category.create({
        data: {
          communityId: created.id,
          name: taxonomy.name,
          slug: categorySlug(taxonomy.name, index),
          icon: taxonomy.icon,
          sortOrder: index,
          conditionEnabled: taxonomy.conditionEnabled,
          fieldSchema: taxonomy.fields as any,
        },
      });
    if (intent.organization.onboardingDraft)
      await tx.organization.update({
        where: { id: intent.organizationId },
        data: {
          name: ctx.chat.title || "Telegram-сообщество",
          onboardingDraft: false,
        },
      });
    await tx.communityConnectionIntent.update({
      where: { id: intent.id },
      data: { status: "claimed", communityId: created.id },
    });
    await tx.auditEvent.create({
      data: {
        communityId: created.id,
        actorId: intent.requestedById,
        scope: "onboarding",
        action: "community_connected",
        targetType: "Community",
        targetId: created.id,
        metadata: { telegramChatId: String(chatId) },
      },
    });
    return created;
  });
  await ctx.reply(
    `✅ Доска для «${community.name}» подключена.\n\nВажно: не отключайте боту доступ к сообщениям — он нужен для учёта активности.`,
  );
  await installGroupBoardEntry(ctx, community);
}

bot.start(async (ctx) => {
  if (ctx.chat.type !== "private" && ctx.startPayload?.startsWith("connect_")) {
    await claimCommunityConnection(ctx, ctx.startPayload.slice(8));
    return;
  }
  if (
    ctx.startPayload?.startsWith("login_") ||
    ctx.startPayload?.startsWith("loginp_")
  ) {
    if (ctx.chat.type !== "private")
      return ctx.reply("Подтвердить вход можно только в личном чате с ботом.");
    const platformOwnerLogin = ctx.startPayload.startsWith("loginp_");
    const rawToken = ctx.startPayload.slice(platformOwnerLogin ? 7 : 6);
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken))
      return ctx.reply(
        "Ссылка входа повреждена. Начните вход заново на сайте.",
      );
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const intent = await prisma.webLoginIntent.findUnique({
      where: { tokenHash },
    });
    if (
      !intent ||
      intent.status !== "pending" ||
      intent.expiresAt <= new Date()
    )
      return ctx.reply(
        "Ссылка входа уже использована или истекла. Начните вход заново на сайте.",
      );
    const user = await prisma.user.upsert({
      where: { telegramUserId: BigInt(ctx.from.id) },
      update: {
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        languageCode: ctx.from.language_code,
        botStartedAt: new Date(),
        lastSeenAt: new Date(),
      },
      create: {
        telegramUserId: BigInt(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        languageCode: ctx.from.language_code,
        botStartedAt: new Date(),
      },
    });
    const claimed = await prisma.webLoginIntent.updateMany({
      where: {
        id: intent.id,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      data: { status: "claimed", userId: user.id, claimedAt: new Date() },
    });
    if (claimed.count !== 1)
      return ctx.reply("Ссылка входа уже подтверждена. Вернитесь на сайт.");
    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        scope: "platform_security",
        action: "web_telegram_login_confirmed",
        targetType: "WebLoginIntent",
        targetId: intent.id,
      },
    });
    return ctx.reply(
      platformOwnerLogin
        ? "✅ Личность подтверждена. Вернитесь в браузер или нажмите кнопку ниже."
        : "✅ Вход подтверждён. Откройте браузерный кабинет администратора сообщества.",
      confirmedWebLogin(rawToken, platformOwnerLogin),
    );
  }
  if (ctx.startPayload === "platform") {
    if (ctx.chat.type !== "private")
      return ctx.reply("Откройте личный чат с ботом, чтобы войти в кабинет.");
    return ctx.reply(
      "Откройте кабинет администратора, чтобы подключить Telegram-сообщество.",
      platformBoard(ctx.from.language_code),
    );
  }
  const user = await prisma.user.findUnique({
    where: { telegramUserId: BigInt(ctx.from.id) },
    include: { members: true },
  });
  if (ctx.chat.type === "private" && user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { botStartedAt: new Date() } as any,
    });
  }
  const moderationStart = ctx.startPayload?.startsWith("moderate_");
  const requestedSlug = ctx.startPayload?.replace(/^(community|moderate)_/, "");
  const requestedCommunity = requestedSlug
    ? await prisma.community.findUnique({ where: { slug: requestedSlug } })
    : null;
  const selectedMembership = requestedCommunity
    ? user?.members.find(
        (member) => member.communityId === requestedCommunity.id,
      )
    : user?.members.length === 1
      ? user.members[0]
      : undefined;
  const privileged =
    selectedMembership && roles.has(selectedMembership.role)
      ? selectedMembership
      : user?.members.find((member) => roles.has(member.role));
  if (!requestedCommunity && (user?.members.length || 0) > 1) {
    const communities = await prisma.community.findMany({
      where: { members: { some: { userId: user!.id } }, isActive: true },
      orderBy: { name: "asc" },
    });
    await ctx.reply(
      bt(ctx.from.language_code, "choose"),
      Markup.inlineKeyboard(
        communities.map((community) => [
          Markup.button.webApp(community.name, boardUrl(community.slug)),
        ]),
      ),
    );
    return;
  }
  await ctx.reply(
    privileged
      ? `Бот подключён. Ваша роль: ${privileged.role}. Карточки модерации будут приходить в этот чат.`
      : bt(
          requestedCommunity?.defaultLocale || ctx.from.language_code,
          "privateIntro",
        ),
    privateBoard(
      requestedCommunity?.slug,
      moderationStart ? "admin" : undefined,
      requestedCommunity?.defaultLocale || ctx.from.language_code,
    ),
  );
});
bot.command("board", async (ctx) => {
  const community =
    ctx.chat.type === "private"
      ? null
      : await prisma.community.findUnique({
          where: { telegramChatId: BigInt(ctx.chat.id) },
        });
  if (ctx.chat.type !== "private" && !community)
    return ctx.reply("Эта группа пока не подключена к сервису.");
  return ctx.reply(
    bt(community?.defaultLocale || ctx.from.language_code, "listings"),
    ctx.chat.type === "private"
      ? privateBoard(undefined, undefined, ctx.from.language_code)
      : publicBoard(community!.slug, community!.defaultLocale),
  );
});
bot.command("install_board", async (ctx) => {
  if (ctx.chat.type === "private")
    return ctx.reply(
      "Эту команду нужно отправить в подключённой Telegram-группе.",
    );
  const community = await prisma.community.findUnique({
    where: { telegramChatId: BigInt(ctx.chat.id) },
  });
  if (!community)
    return ctx.reply(
      "Эта группа пока не подключена. Начните подключение в кабинете владельца.",
    );
  const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
  if (!["creator", "administrator"].includes(member.status))
    return ctx.reply(
      "Установить и закрепить кнопку может только владелец или администратор группы.",
    );
  await installGroupBoardEntry(ctx, community);
});
bot.command("help", (ctx) =>
  ctx.reply(
    "/board — открыть доску\n/install_board — установить кнопку в группе (для админов)\n/myads — мои объявления\n/rules — правила\n/connect — кабинет администратора сообщества\n/terms — условия сервиса\n/support — поддержка\n/paysupport — вопросы по оплате",
  ),
);
bot.command("terms", async (ctx) => {
  const document = await prisma.legalDocument.findFirst({
    where: { type: "terms", published: true, effectiveAt: { lte: new Date() } },
    orderBy: { effectiveAt: "desc" },
  });
  const termsUrl = new URL("/terms", appUrl).toString();
  return ctx.reply(
    document
      ? `${document.title} · ${document.version}\n\n${document.body.slice(0, 3300)}\n\nПолная актуальная версия: ${termsUrl}`
      : `Условия сервиса: ${termsUrl}`,
  );
});
const supportReply = (ctx: any) =>
  ctx.reply(
    "Опишите вопрос в ответном сообщении или свяжитесь с администратором вашего сообщества. Для вопроса о Stars укажите дату, сумму и название объявления. Не присылайте коды или пароли.",
  );
bot.command("support", supportReply);
bot.command("paysupport", (ctx) =>
  ctx.reply(
    `По вопросу Telegram Stars укажите дату, сумму, название объявления и опишите проблему. Не присылайте коды или пароли.\n\nПоддержка: ${new URL("/support", appUrl).toString()}`,
  ),
);
bot.command("connect", (ctx) => {
  if (ctx.chat.type !== "private")
    return ctx.reply("Откройте личный чат с ботом и отправьте /connect.");
  return ctx.reply(
    "Откройте кабинет, чтобы подключить свою Telegram-группу.",
    platformBoard(),
  );
});
bot.command("rules", async (ctx) => {
  const c =
    ctx.chat.type === "private"
      ? await prisma.community.findFirst({
          where: {
            isActive: true,
            members: {
              some: { user: { telegramUserId: BigInt(ctx.from.id) } },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : await prisma.community.findUnique({
          where: { telegramChatId: BigInt(ctx.chat.id) },
        });
  await ctx.reply(c?.rules || "Правила сообщества пока не опубликованы.");
});
bot.command("myads", async (ctx) => {
  const community =
    ctx.chat.type === "private"
      ? null
      : await prisma.community.findUnique({
          where: { telegramChatId: BigInt(ctx.chat.id) },
        });
  return ctx.reply(
    bt(community?.defaultLocale || ctx.from.language_code, "myAds"),
    Markup.inlineKeyboard([
      Markup.button.webApp(
        bt(community?.defaultLocale || ctx.from.language_code, "myAds"),
        boardUrl(community?.slug, "my-listings"),
      ),
    ]),
  );
});
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
    const claimed = await prisma.notification.updateMany({
      where: { id: n.id, status: "pending" },
      data: { status: "processing" },
    });
    if (!claimed.count) continue;
    try {
      if (n.type === "moderation_pending")
        await sendModerationCard((n.payload as any).listingId);
      else if (n.user) {
        const member = await prisma.communityMember.findUnique({
          where: {
            communityId_userId: {
              communityId: n.communityId,
              userId: n.user.id,
            },
          },
        });
        const disabled =
          (n.type === "listing_interest" &&
            !(member as any)?.notifyBuyerInterest) ||
          (n.type.startsWith("listing_") &&
            n.type !== "listing_interest" &&
            !(member as any)?.notifyListingUpdates);
        if (disabled) {
          await prisma.notification.updateMany({
            where: { id: n.id, status: "processing" },
            data: {
              status: "sent",
              sentAt: new Date(),
              attempts: { increment: 1 },
              lastError: "Skipped by user preferences",
            },
          });
          continue;
        }
        await bot.telegram.sendMessage(
          n.user.telegramUserId.toString(),
          notificationText(n.type, n.payload as any),
          Markup.inlineKeyboard([Markup.button.webApp("Открыть", appUrl)]),
        );
      }
      await prisma.notification.updateMany({
        where: { id: n.id, status: "processing" },
        data: {
          status: "sent",
          sentAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } catch (e) {
      await prisma.notification.updateMany({
        where: { id: n.id, status: "processing" },
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
      if (listing.images[0])
        await bot.telegram.sendPhoto(chatId, mediaUrl(listing.images[0].id), {
          caption: text,
          ...keyboard.reply_markup,
        });
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
        payment_refunded:
          "Оплата Telegram Stars возвращена. Платная публикация скрыта.",
        tenant_permission_failure:
          "Бот удалён из группы или потерял доступ. Доска приостановлена; проверьте права бота в кабинете владельца.",
        support_reply:
          "Поддержка ответила на ваше обращение. Откройте кабинет администратора, чтобы прочитать ответ.",
      } as any
    )[type] || "Новое уведомление") + reason
  );
}
bot.on("pre_checkout_query", async (ctx) => {
  if (ctx.preCheckoutQuery.invoice_payload.startsWith("owner_subscription:")) {
    const [, organizationId, userId] =
      ctx.preCheckoutQuery.invoice_payload.split(":");
    const [owner, organization, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { telegramUserId: BigInt(ctx.from.id) },
        include: { organizations: true },
      }),
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.platformSetting.findUnique({ where: { id: "global" } }),
    ]);
    const valid =
      owner?.id === userId &&
      organization &&
      owner.organizations.some(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.role === "owner",
      ) &&
      ctx.preCheckoutQuery.currency === "XTR" &&
      ctx.preCheckoutQuery.total_amount ===
        (settings?.freeBoardSubscriptionStars || 750);
    await ctx.answerPreCheckoutQuery(
      Boolean(valid),
      valid
        ? undefined
        : "Подписка недействительна. Создайте новый счёт в кабинете владельца.",
    );
    return;
  }
  const payment = await prisma.publicationPayment.findUnique({
    where: { invoicePayload: ctx.preCheckoutQuery.invoice_payload },
  });
  const valid =
    payment &&
    payment.status === "pending" &&
    ["clear", "approved"].includes(payment.reviewStatus) &&
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
    if (paid.invoice_payload.startsWith("owner_subscription:")) {
      const [, organizationId, userId] = paid.invoice_payload.split(":");
      const payer = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(ctx.from.id) },
      });
      if (!payer || payer.id !== userId || paid.currency !== "XTR")
        throw new Error("Owner subscription payer mismatch");
      const expirationSeconds = Number(
        (paid as any).subscription_expiration_date ||
          Math.floor(Date.now() / 1000) + 2_592_000,
      );
      await prisma.$transaction([
        prisma.organization.update({
          where: { id: organizationId },
          data: {
            starsSubscriptionStatus: "active",
            starsSubscriptionChargeId: paid.telegram_payment_charge_id,
            starsSubscriptionExpiresAt: new Date(expirationSeconds * 1000),
            starsSubscriptionPrice: paid.total_amount,
          },
        }),
        prisma.auditEvent.create({
          data: {
            actorId: payer.id,
            scope: "owner_billing",
            action: "stars_subscription_paid",
            targetType: "Organization",
            targetId: organizationId,
            metadata: {
              amountStars: paid.total_amount,
              expiresAt: new Date(expirationSeconds * 1000).toISOString(),
            },
          },
        }),
      ]);
      await ctx.reply(
        `✅ Подписка владельца активна до ${new Date(expirationSeconds * 1000).toLocaleDateString("ru-RU")}.\nТеперь можно включить бесплатные публикации для всех в кабинете владельца.`,
        platformBoard(),
      );
      return;
    }
    const payment = await prisma.publicationPayment.findUnique({
      where: { invoicePayload: paid.invoice_payload },
      include: { community: true },
    });
    if (
      payment &&
      paid.currency === "XTR" &&
      paid.total_amount === payment.amountStars
    ) {
      if (!payment.community.organizationId)
        throw new Error("Payment community has no billing organization");
      const organizationId = payment.community.organizationId;
      await prisma.$transaction(async (tx) => {
        const accepted = await tx.publicationPayment.updateMany({
          where: {
            id: payment.id,
            status: "pending",
            telegramPaymentChargeId: null,
          },
          data: {
            status: "paid",
            paidAt: new Date(),
            telegramPaymentChargeId: paid.telegram_payment_charge_id,
          },
        });
        if (accepted.count === 0) {
          const current = await tx.publicationPayment.findUniqueOrThrow({
            where: { id: payment.id },
          });
          if (
            current.status === "paid" &&
            current.telegramPaymentChargeId === paid.telegram_payment_charge_id
          )
            return;
          throw new Error("Payment is not pending or charge ID differs");
        }
        await recordPaidPublicationLedger(tx, {
          externalRef: `telegram-stars:${paid.telegram_payment_charge_id}`,
          organizationId,
          communityId: payment.communityId,
          paymentId: payment.id,
          telegramPaymentChargeId: paid.telegram_payment_charge_id,
          grossStars: payment.amountStars,
          commissionBps: payment.commissionBps,
          platformFeeStars: payment.platformFeeStars,
          communityShareStars: payment.communityShareStars,
          occurredAt: new Date(),
        });
        await tx.listing.update({
          where: { id: payment.listingId },
          data: { paymentStatus: "paid" },
        });
      });
    }
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
  const month = new Date().toISOString().slice(0, 7);
  const currentActivity = await prisma.messageActivity.findUnique({
    where: {
      communityId_userId_month: {
        communityId: community.id,
        userId: user.id,
        month,
      },
    },
  });
  const rawText =
    "text" in ctx.message
      ? ctx.message.text
      : "caption" in ctx.message && typeof ctx.message.caption === "string"
        ? ctx.message.caption
        : "";
  const quality = qualifyCommunityMessage({
    text: rawText,
    minChars: community.minQualifiedMessageChars,
    maxLinks: community.maxLinksPerQualifiedMessage,
    lastHash: currentActivity?.lastMessageHash,
    lastAt: currentActivity?.lastMessageAt,
  });
  await prisma.messageActivity.upsert({
    where: {
      communityId_userId_month: {
        communityId: community.id,
        userId: user.id,
        month,
      },
    },
    update: {
      totalMessageCount: { increment: 1 },
      ...(quality.qualified
        ? { messageCount: { increment: 1 } }
        : { rejectedMessageCount: { increment: 1 } }),
      lastMessageHash: quality.hash,
      lastMessageAt: new Date(),
    },
    create: {
      communityId: community.id,
      userId: user.id,
      month,
      messageCount: quality.qualified ? 1 : 0,
      totalMessageCount: 1,
      rejectedMessageCount: quality.qualified ? 0 : 1,
      lastMessageHash: quality.hash,
      lastMessageAt: new Date(),
    },
  });
  const day = new Date().toISOString().slice(0, 10);
  await prisma.dailyMessageActivity.upsert({
    where: {
      communityId_userId_day: {
        communityId: community.id,
        userId: user.id,
        day,
      },
    },
    update: {
      totalMessageCount: { increment: 1 },
      ...(quality.qualified
        ? { messageCount: { increment: 1 } }
        : { rejectedMessageCount: { increment: 1 } }),
    },
    create: {
      communityId: community.id,
      userId: user.id,
      day,
      messageCount: quality.qualified ? 1 : 0,
      totalMessageCount: 1,
      rejectedMessageCount: quality.qualified ? 0 : 1,
    },
  });
});
bot.on("my_chat_member", async (ctx) => {
  if (ctx.chat.type === "private") return;
  const community = await prisma.community.findUnique({
    where: { telegramChatId: BigInt(ctx.chat.id) },
  });
  if (!community) return;
  const member = ctx.myChatMember.new_chat_member as any;
  const isAdministrator = member.status === "administrator";
  const active = isAdministrator;
  await prisma.community.update({
    where: { id: community.id },
    data: {
      botStatus: member.status,
      botIsAdministrator: isAdministrator,
      botCanDeleteMessages:
        isAdministrator && Boolean(member.can_delete_messages),
      botCanRestrictMembers:
        isAdministrator && Boolean(member.can_restrict_members),
      botCanInviteUsers: isAdministrator && Boolean(member.can_invite_users),
      botLastCheckedAt: new Date(),
      ...(active
        ? community.tenantStatus === "onboarding"
          ? { tenantStatus: "active", isActive: true, connectedAt: new Date() }
          : {}
        : community.tenantStatus !== "closed"
          ? {
              tenantStatus: "onboarding",
              isActive: false,
              disconnectedAt: new Date(),
            }
          : {}),
    },
  });
  if (!active) {
    const recipients = await prisma.communityMember.findMany({
      where: {
        communityId: community.id,
        role: { in: ["owner", "admin"] },
      },
      select: { userId: true },
    });
    if (recipients.length)
      await prisma.notification.createMany({
        data: recipients.map((recipient) => ({
          communityId: community.id,
          userId: recipient.userId,
          type: "tenant_permission_failure",
          payload: { status: member.status },
        })),
      });
  }
  await prisma.auditEvent.create({
    data: {
      communityId: community.id,
      scope: "telegram_lifecycle",
      action: active ? "bot_membership_updated" : "bot_disconnected",
      targetType: "Community",
      targetId: community.id,
      metadata: { status: member.status, isAdministrator },
    },
  });
});
const timer = setInterval(() => void poll(), 5000);
const botProfileKey = "adnecta:bot-profile:v2";
const profileNeedsSync = !(await redis.get(botProfileKey));
const botProfileSetup = profileNeedsSync
  ? await Promise.allSettled([
      bot.telegram.setMyName("Adnecta"),
      bot.telegram.setMyDescription(
        "Adnecta turns Telegram communities into trusted marketplaces with moderation, activity rules and Stars payments.",
      ),
      bot.telegram.setMyDescription(
        "Adnecta превращает Telegram-сообщества в удобные доски объявлений с модерацией, правилами активности и оплатой в Stars.",
        "ru",
      ),
      bot.telegram.setMyDescription(
        "Adnecta turns Telegram communities into trusted marketplaces with moderation, activity rules and Stars payments.",
        "en",
      ),
      bot.telegram.setMyDescription(
        "Adnecta convierte comunidades de Telegram en marketplaces con moderación, reglas de actividad y pagos con Stars.",
        "es",
      ),
      bot.telegram.setMyShortDescription(
        "The marketplace for your Telegram community.",
      ),
      bot.telegram.setMyShortDescription(
        "Доска объявлений вашего Telegram-сообщества.",
        "ru",
      ),
      bot.telegram.setMyShortDescription(
        "The marketplace for your Telegram community.",
        "en",
      ),
      bot.telegram.setMyShortDescription(
        "El marketplace de tu comunidad de Telegram.",
        "es",
      ),
      bot.telegram.setChatMenuButton({
        menuButton: {
          type: "web_app",
          text: "Открыть Adnecta",
          web_app: { url: appUrl },
        },
      }),
      bot.telegram.setMyDefaultAdministratorRights({
        forChannels: false,
        rights: {
          is_anonymous: false,
          can_manage_chat: true,
          can_delete_messages: true,
          can_manage_video_chats: false,
          can_restrict_members: true,
          can_promote_members: false,
          can_change_info: false,
          can_invite_users: true,
          can_post_stories: false,
          can_edit_stories: false,
          can_delete_stories: false,
          can_pin_messages: true,
          can_manage_topics: false,
        },
      }),
    ])
  : [];
for (const result of botProfileSetup)
  if (result.status === "rejected")
    console.warn(
      "Unable to apply an Adnecta bot profile setting",
      result.reason,
    );
const privateCommands = (locale: BotLocale) => [
  { command: "board", description: bt(locale, "boardCommand") },
  { command: "myads", description: bt(locale, "myAds") },
  { command: "rules", description: bt(locale, "rulesCommand") },
  { command: "connect", description: bt(locale, "owner") },
  {
    command: "terms",
    description: locale === "ru" ? "Условия сервиса" : "Terms of service",
  },
  {
    command: "support",
    description: locale === "ru" ? "Поддержка" : "Support",
  },
  {
    command: "paysupport",
    description: locale === "ru" ? "Поддержка по оплате" : "Payment support",
  },
  { command: "help", description: locale === "ru" ? "Справка" : "Help" },
];
if (profileNeedsSync) {
  const commandSetup = await Promise.allSettled([
    bot.telegram.setMyCommands(privateCommands("en")),
    ...[...supportedLocales].map((locale) =>
      bot.telegram.setMyCommands(privateCommands(locale as BotLocale), {
        language_code: locale,
      }),
    ),
  ]);
  const failed = [...botProfileSetup, ...commandSetup].filter(
    (result) => result.status === "rejected",
  ).length;
  // Avoid a restart loop hitting Telegram profile rate limits. A partial
  // failure is retried later; a complete sync is refreshed weekly.
  await redis.set(
    botProfileKey,
    String(Date.now()),
    "EX",
    failed ? 21_600 : 604_800,
  );
}
bot.launch();
process.once("SIGTERM", () => {
  clearInterval(timer);
  bot.stop("SIGTERM");
  void redis.quit();
  void prisma.$disconnect();
});

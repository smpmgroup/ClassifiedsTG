import { useEffect, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "./i18n";
import { LanguageSelect } from "./LanguageSelect";
import { PublicSite } from "./PublicSite";
import {
  activateSession,
  api,
  apiBlob,
  login,
  platformLogin,
  completePlatformTwoFactor,
  logoutPlatformSession,
  request,
  setAdminCommunityId,
  setPlatformToken,
  switchTenantCommunity,
} from "./api";
type Listing = {
  id: string;
  title: string;
  price?: string;
  currency: string;
  locationText?: string;
  condition: string;
  images: { url?: string }[];
  priceType?: string;
  category?: { name: string; icon?: string };
  imageCount?: number;
  isFavorite?: boolean;
  publishedAt?: string;
};
type CommunityShowcase = {
  name: string;
  defaultLocale: string;
  description: string;
  hasAvatar: boolean;
  minMonthlyMessagesForFree: number;
  activityWindowDays: number;
  monetizationMode: string;
  publicationPriceStars: number;
  messageCount: number;
  freeForUser: boolean;
  isPrivileged: boolean;
  messagesRemaining: number;
};
const categoryTranslations: Record<string, Record<string, string>> = {
  Транспорт: {
    en: "Vehicles",
    es: "Vehículos",
    ca: "Vehicles",
    ru: "Транспорт",
    uk: "Транспорт",
    fr: "Véhicules",
    de: "Fahrzeuge",
    it: "Veicoli",
    pt: "Veículos",
  },
  Недвижимость: {
    en: "Property",
    es: "Inmobiliaria",
    ca: "Immobiliària",
    ru: "Недвижимость",
    uk: "Нерухомість",
    fr: "Immobilier",
    de: "Immobilien",
    it: "Immobili",
    pt: "Imóveis",
  },
  Электроника: {
    en: "Electronics",
    es: "Electrónica",
    ca: "Electrònica",
    ru: "Электроника",
    uk: "Електроніка",
    fr: "Électronique",
    de: "Elektronik",
    it: "Elettronica",
    pt: "Eletrónica",
  },
  "Дом и сад": {
    en: "Home & garden",
    es: "Hogar y jardín",
    ca: "Llar i jardí",
    ru: "Дом и сад",
    uk: "Дім і сад",
    fr: "Maison et jardin",
    de: "Haus & Garten",
    it: "Casa e giardino",
    pt: "Casa e jardim",
  },
  "Одежда и обувь": {
    en: "Fashion",
    es: "Ropa y calzado",
    ca: "Roba i calçat",
    ru: "Одежда и обувь",
    uk: "Одяг і взуття",
    fr: "Mode",
    de: "Mode",
    it: "Abbigliamento",
    pt: "Roupa e calçado",
  },
  "Детские товары": {
    en: "Kids",
    es: "Infantil",
    ca: "Infantil",
    ru: "Детские товары",
    uk: "Дитячі товари",
    fr: "Enfants",
    de: "Kinder",
    it: "Bambini",
    pt: "Crianças",
  },
  Работа: {
    en: "Jobs",
    es: "Empleo",
    ca: "Feina",
    ru: "Работа",
    uk: "Робота",
    fr: "Emploi",
    de: "Jobs",
    it: "Lavoro",
    pt: "Emprego",
  },
  Услуги: {
    en: "Services",
    es: "Servicios",
    ca: "Serveis",
    ru: "Услуги",
    uk: "Послуги",
    fr: "Services",
    de: "Dienstleistungen",
    it: "Servizi",
    pt: "Serviços",
  },
  Животные: {
    en: "Pets",
    es: "Animales",
    ca: "Animals",
    ru: "Животные",
    uk: "Тварини",
    fr: "Animaux",
    de: "Tiere",
    it: "Animali",
    pt: "Animais",
  },
  "Отдам бесплатно": {
    en: "Free items",
    es: "Gratis",
    ca: "Gratuït",
    ru: "Отдам бесплатно",
    uk: "Віддам безкоштовно",
    fr: "À donner",
    de: "Zu verschenken",
    it: "In regalo",
    pt: "Grátis",
  },
  Обмен: {
    en: "Exchange",
    es: "Intercambio",
    ca: "Intercanvi",
    ru: "Обмен",
    uk: "Обмін",
    fr: "Échange",
    de: "Tausch",
    it: "Scambio",
    pt: "Troca",
  },
  Другое: {
    en: "Other",
    es: "Otros",
    ca: "Altres",
    ru: "Другое",
    uk: "Інше",
    fr: "Autres",
    de: "Sonstiges",
    it: "Altro",
    pt: "Outros",
  },
};
const localizedCategory = (name?: string, language?: string) =>
  name
    ? categoryTranslations[name]?.[String(language || "en").slice(0, 2)] || name
    : "";
const estimatedTon = (stars: number, rate: any) =>
  rate?.tonPerStar
    ? `${(Number(stars || 0) * Number(rate.tonPerStar)).toLocaleString("ru", { maximumFractionDigits: 4 })} TON`
    : "TON уточняется";
const actualTon = (nano: string | number | bigint | null | undefined) =>
  nano
    ? `${(Number(nano) / 1_000_000_000).toLocaleString("ru", { maximumFractionDigits: 9 })} TON`
    : "";
export function App() {
  const { t } = useTranslation();
  const pathName = window.location.pathname.replace(/\/$/, "") || "/";
  const platformAdminMode = ["/platform-admin", "/platform-owner"].includes(
    pathName,
  );
  const platformMode =
    ["/dashboard", "/owner"].includes(pathName) ||
    platformAdminMode ||
    new URLSearchParams(window.location.search).get("mode") === "platform";
  const publicPath =
    [
      "/login",
      "/platform-login",
      "/pricing",
      "/docs",
      "/terms",
      "/privacy",
      "/prohibited",
      "/support",
    ].includes(pathName) ||
    pathName.startsWith("/login/") ||
    pathName.startsWith("/platform-login/") ||
    (pathName === "/" &&
      !platformMode &&
      !new URLSearchParams(window.location.search).get("community") &&
      !window.Telegram?.WebApp.initData);
  const telegramInitData = window.Telegram?.WebApp.initData || "";
  const launchCommunity = (
    new URLSearchParams(window.location.search).get("community") ||
    new URLSearchParams(window.location.search).get("tgWebAppStartParam") ||
    new URLSearchParams(telegramInitData).get("start_param") ||
    ""
  ).replace(/^community_/, "");
  const storedTenantCommunity =
    sessionStorage.getItem("tenantCommunitySlug") || "";
  const telegramTenantLaunchRequiresLogin =
    !platformMode &&
    Boolean(telegramInitData) &&
    (!activateSession("tenant") ||
      (Boolean(launchCommunity) && launchCommunity !== storedTenantCommunity));
  const [state, setState] = useState<
    | "loading"
    | "ready"
    | "outside"
    | "denied"
    | "select"
    | "twoFactor"
    | "error"
  >(
    telegramTenantLaunchRequiresLogin
      ? "loading"
      : activateSession(platformMode ? "platform" : "tenant")
        ? "ready"
        : "loading",
  );
  const [tenantRevision, setTenantRevision] = useState(0);
  const [invite, setInvite] = useState("");
  const [communityChoices, setCommunityChoices] = useState<any[]>([]);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState("");
  const boot = async () => {
    const init =
      window.Telegram?.WebApp.initData ||
      import.meta.env.VITE_TELEGRAM_INIT_DATA;
    if (!init && import.meta.env.PROD) {
      if (platformMode) {
        // A browser login is stored in an HttpOnly cookie and therefore cannot
        // be inspected by JavaScript. Ask the server before deciding that the
        // visitor has no session.
        try {
          await request("/platform/me");
          setState("ready");
          return;
        } catch {
          window.location.replace(
            platformAdminMode ? "/platform-login" : "/login",
          );
        }
        return;
      }
      setState("outside");
      return;
    }
    if (!init) {
      setState("ready");
      return;
    }
    try {
      if (platformMode) {
        const result = await platformLogin(init);
        if (result.requiresTwoFactor) {
          setTwoFactorChallenge(result.challengeToken);
          setState("twoFactor");
          return;
        }
      } else
        await login(
          init,
          new URLSearchParams(window.location.search).get("community") ||
            undefined,
        );
      setState("ready");
    } catch (e: any) {
      if (e.code === "NOT_GROUP_MEMBER") {
        setInvite(e.body?.inviteUrl);
        setState("denied");
      } else if (e.code === "COMMUNITY_REQUIRED") {
        setCommunityChoices(e.body?.error?.details || []);
        setState("select");
      } else setState("error");
    }
  };
  useEffect(() => {
    if (!publicPath) void boot();
  }, [publicPath]);
  if (publicPath) return <PublicSite />;
  if (state === "loading")
    return (
      <Shell>
        <Skeleton />
      </Shell>
    );
  if (state === "outside") return <Message text={t("openTelegram")} />;
  if (state === "denied")
    return (
      <Message
        text={t("join")}
        actions={
          <>
            <a className="primary" href={invite}>
              {t("joinGroup")}
            </a>
            <button onClick={boot}>{t("retry")}</button>
          </>
        }
      />
    );
  if (state === "select")
    return (
      <Message
        text={t("chooseCommunity")}
        actions={
          <div className="community-select">
            {communityChoices.map((community) => (
              <button
                className="primary"
                key={community.id}
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("community", community.slug);
                  window.history.replaceState({}, "", url);
                  setState("loading");
                  void boot();
                }}
              >
                {community.name}
              </button>
            ))}
          </div>
        }
      />
    );
  if (state === "twoFactor")
    return (
      <TwoFactorLogin
        challengeToken={twoFactorChallenge}
        onComplete={() => setState("ready")}
        onRestart={() => {
          setState("loading");
          void boot();
        }}
      />
    );
  if (state === "error")
    return (
      <Message
        text="Не удалось открыть доску"
        actions={<button onClick={boot}>{t("retry")}</button>}
      />
    );
  if (platformMode)
    return <PlatformWorkspace platformAdminOnly={platformAdminMode} />;
  return (
    <Shell key={tenantRevision}>
      <ScrollToTop />
      <CommunitySwitcher
        onSwitched={(community) => {
          const url = new URL(window.location.href);
          url.pathname = "/";
          url.search = "";
          url.searchParams.set("community", community.slug);
          window.history.replaceState({}, "", url);
          setTenantRevision((current) => current + 1);
        }}
      />
      <Routes>
        <Route path="/" element={<Catalog />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/add" element={<Create />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
      <nav>
        {[
          ["/", "⌂", "home"],
          ["/categories", "▦", "categories"],
          ["/add", "＋", "add"],
          ["/favorites", "♡", "favorites"],
          ["/profile", "◉", "profile"],
        ].map(([to, icon, key]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            <b>{icon}</b>
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>
    </Shell>
  );
}

function CommunitySwitcher({
  onSwitched,
}: {
  onSwitched: (community: any) => void;
}) {
  const { t, i18n } = useTranslation();
  const [communities, setCommunities] = useState<any[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    request("/communities")
      .then(setCommunities)
      .catch(() => undefined);
  }, []);
  const current = communities.find((community) => community.current);
  return (
    <header className="tenant-community-switcher">
      {communities.length > 1 && (
        <label>
          <span>{t("switchCommunity")}</span>
          <select
            aria-label="Переключить сообщество"
            disabled={switching}
            value={current?.id || ""}
            onChange={async (event) => {
              const target = communities.find(
                (community) => community.id === event.target.value,
              );
              if (!target || target.current) return;
              setSwitching(true);
              setError("");
              try {
                await switchTenantCommunity(target.id);
                onSwitched(target);
              } catch (unknownError: any) {
                setError(unknownError.message || t("switchError"));
                setSwitching(false);
              }
            }}
          >
            {communities.map((community) => (
              <option value={community.id} key={community.id}>
                {community.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="tenant-language-select">
        <span>{t("language")}</span>
        <select
          aria-label={t("language")}
          value={i18n.resolvedLanguage || "en"}
          onChange={(event) => {
            localStorage.setItem("adnecta-language", event.target.value);
            void i18n.changeLanguage(event.target.value);
          }}
        >
          {supportedLanguages.map(([code, name]) => (
            <option value={code} key={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {switching && <small>{t("switching")}</small>}
      {error && <small className="switch-error">{error}</small>}
    </header>
  );
}

function TwoFactorLogin({
  challengeToken,
  onComplete,
  onRestart,
}: {
  challengeToken: string;
  onComplete: () => void;
  onRestart: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="two-factor-page">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await completePlatformTwoFactor(challengeToken, code);
            onComplete();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <small>ЗАЩИЩЁННЫЙ ВХОД</small>
        <h1>Подтвердите вход</h1>
        <p>
          Введите шестизначный код приложения-аутентификатора или один резервный
          код.
        </p>
        <input
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
          placeholder="000000"
          minLength={6}
          maxLength={12}
          required
        />
        {error && <LoadError message={error} />}
        <button className="primary" disabled={busy}>
          {busy ? "Проверяем…" : "Продолжить"}
        </button>
        <button type="button" onClick={onRestart}>
          Начать вход заново
        </button>
      </form>
    </main>
  );
}

function PlatformTwoFactorSecurity({
  security,
  onChanged,
}: {
  security: any;
  onChanged: () => Promise<any>;
}) {
  const [setup, setSetup] = useState<any>();
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const regenerate = async () => {
    const currentCode = window.prompt(
      "Введите текущий шестизначный код приложения-аутентификатора:",
    );
    if (!currentCode) return;
    setBusy(true);
    setError("");
    try {
      const result = await request(
        "/platform/security/two-factor/backup-codes",
        "POST",
        { code: currentCode },
      );
      setBackupCodes(result.backupCodes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (security.enabled && !backupCodes.length)
    return (
      <section className="two-factor-security ready">
        <div>
          <small>БЕЗОПАСНОСТЬ</small>
          <h2>Двухфакторная защита включена</h2>
          <p>
            Сессия подтверждена: {security.sessionVerified ? "да" : "нет"}.
            Резервных кодов: {security.backupCodesRemaining}.
          </p>
        </div>
        {security.sessionVerified && (
          <button disabled={busy} onClick={() => void regenerate()}>
            {busy ? "Создаём…" : "Заменить резервные коды"}
          </button>
        )}
        {error && <LoadError message={error} />}
      </section>
    );
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      setSetup(
        await request("/platform/security/two-factor/setup", "POST", {}),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request(
        "/platform/security/two-factor/confirm",
        "POST",
        { code },
      );
      setPlatformToken(result.accessToken);
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setCode("");
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="two-factor-security">
      <small>
        {security.required ? "ТРЕБУЕТСЯ ДЛЯ ДОСТУПА" : "РЕКОМЕНДУЕТСЯ"}
      </small>
      <h2>
        {backupCodes.length
          ? "Сохраните резервные коды"
          : "Защитите кабинет вторым фактором"}
      </h2>
      {backupCodes.length ? (
        <>
          <p>
            Каждый код работает только один раз. Сохраните их вне Telegram —
            после закрытия они больше не показываются.
          </p>
          <pre>{backupCodes.join("\n")}</pre>
          <button
            className="primary"
            onClick={() => {
              setBackupCodes([]);
              void onChanged();
            }}
          >
            Я надёжно сохранил коды
          </button>
        </>
      ) : !setup ? (
        <>
          <p>
            Для служебных ролей вход без TOTP запрещён. Подойдёт Google
            Authenticator, 1Password, Microsoft Authenticator или аналог.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? "Создаём…" : "Настроить 2FA"}
          </button>
        </>
      ) : (
        <form onSubmit={confirm}>
          <p>
            Откройте ссылку в приложении-аутентификаторе или добавьте ключ
            вручную.
          </p>
          <a className="primary" href={setup.otpauthUrl}>
            Открыть в аутентификаторе
          </a>
          <label>
            Ключ для ручного ввода
            <input
              readOnly
              value={setup.secret}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <label>
            Код из приложения
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="000000"
              minLength={6}
              maxLength={6}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Проверяем…" : "Подтвердить и включить"}
          </button>
        </form>
      )}
      {error && <LoadError message={error} />}
    </section>
  );
}

function PlatformWorkspace({
  platformAdminOnly = false,
}: {
  platformAdminOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = () =>
    request("/platform/me")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const connect = async (organizationId?: string) => {
    const busyKey = organizationId || "new-community";
    setBusy(busyKey);
    setError("");
    try {
      const intent = await request("/platform/connect-intents", "POST", {
        ...(organizationId ? { organizationId } : {}),
      });
      window.Telegram?.WebApp.openTelegramLink
        ? window.Telegram.WebApp.openTelegramLink(intent.addBotUrl)
        : (window.location.href = intent.addBotUrl);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  if (!data) return <Message text={error || t("loadingDashboard")} />;
  const missingLegal =
    data.legalDocuments?.filter((document: any) => !document.accepted) || [];
  if (missingLegal.length)
    return <LegalAcceptance documents={missingLegal} onAccepted={load} />;
  const ownerCommunities = data.organizations.flatMap(
    (organization: any) => organization.communities || [],
  );
  const activeCommunities = ownerCommunities.filter(
    (community: any) =>
      community.tenantStatus === "active" && community.botIsAdministrator,
  );
  const readyCommunities = ownerCommunities.filter(
    (community: any) =>
      community.setup?.connected &&
      community.setup?.administrator &&
      community.setup?.permissions &&
      community.setup?.rules,
  ).length;
  const totalListings = ownerCommunities.reduce(
    (sum: number, community: any) =>
      sum + Number(community._count?.listings || 0),
    0,
  );
  const firstManageableOrganization = data.organizations.find(
    (organization: any) =>
      ["owner", "administrator"].includes(organization.role),
  );
  const ownerTab =
    new URLSearchParams(window.location.search).get("tab") || "overview";
  const selectedCommunityId =
    new URLSearchParams(window.location.search).get("community") ||
    ownerCommunities[0]?.id ||
    "";
  const administrationTabs = new Set([
    "moderation",
    "reports",
    "users",
    "categories",
    "risk",
    "settings",
    "audit",
  ]);
  return (
    <main
      className={`platform-workspace ${platformAdminOnly ? "service-owner-workspace" : "owner-workspace"}`}
    >
      <nav className="dashboard-nav">
        <a href="/">
          <span>AD</span>
          <b>Adnecta</b>
        </a>
        <div>
          {platformAdminOnly && (
            <a href="/owner">{t("communityDashboardLink")}</a>
          )}
          <a href="/docs">{t("instruction")}</a>
          <a href="/support">{t("support")}</a>
          <LanguageSelect compact />
          <button
            onClick={() => {
              void logoutPlatformSession().finally(() =>
                window.location.assign(
                  platformAdminOnly ? "/platform-login" : "/login",
                ),
              );
            }}
          >
            {t("logout")}
          </button>
        </div>
      </nav>
      <header className="platform-header">
        <div>
          <small>ADNECTA PLATFORM</small>
          <h1>
            {platformAdminOnly
              ? t("platformOwnerDashboard")
              : t("communityAdminDashboard")}
          </h1>
          <p>
            {data.user.firstName}
            {data.user.username ? ` · @${data.user.username}` : ""}
          </p>
        </div>
        <div className="avatar">
          {data.user.firstName?.charAt(0).toUpperCase() || "U"}
        </div>
      </header>
      <nav
        className="workspace-nav"
        aria-label={
          platformAdminOnly ? "Разделы платформы" : "Разделы кабинета"
        }
      >
        {platformAdminOnly ? (
          <>
            <a href="#platform-overview">{t("overview")}</a>
            <a href="#platform-settings">{t("settings")}</a>
            <a href="#platform-health">{t("system")}</a>
            <a href="#platform-finance">{t("finance")}</a>
            <a href="#platform-communities">{t("communities")}</a>
            <a href="#platform-team">{t("team")}</a>
            <a href="#platform-support">{t("support")}</a>
          </>
        ) : (
          <>
            <a href="/owner?tab=overview">
              <span>⌂</span> {t("overview")}
            </a>
            <a href="/owner?tab=communities">
              <span>▦</span> {t("communities")}
            </a>
            <a href="/owner?tab=moderation">
              <span>✓</span> Модерация
            </a>
            <a href="/owner?tab=reports">
              <span>!</span> Жалобы
            </a>
            <a href="/owner?tab=users">
              <span>♙</span> Люди
            </a>
            <a href="/owner?tab=categories">
              <span>▦</span> Категории
            </a>
            <a href="/owner?tab=settings">
              <span>⚙</span> Настройки
            </a>
            <a href="/owner?tab=finance">
              <span>★</span> {t("starsPayouts")}
            </a>
            <a href="/owner?tab=support">
              <span>?</span> {t("support")}
            </a>
          </>
        )}
      </nav>
      {!platformAdminOnly && ownerTab === "overview" && (
        <section
          className={`owner-connect-hub ${activeCommunities.length ? "connected" : ""}`}
          id="owner-start"
        >
          <div className="owner-connect-copy">
            <small>
              {activeCommunities.length
                ? t("connectedLabel")
                : t("quickLaunch")}
            </small>
            <h2>
              {activeCommunities.length
                ? t("boardsManageTitle")
                : t("connectTelegramTitle")}
            </h2>
            <p>
              {activeCommunities.length
                ? t("boardsManageText")
                : t("connectTelegramText")}
            </p>
            {!activeCommunities.length && (
              <button
                className="primary owner-connect-action"
                disabled={
                  busy === (firstManageableOrganization?.id || "new-community")
                }
                onClick={() => void connect(firstManageableOrganization?.id)}
              >
                {busy === (firstManageableOrganization?.id || "new-community")
                  ? t("openingTelegram")
                  : t("connectCommunityArrow")}
              </button>
            )}
          </div>
          <div className="owner-connect-steps" aria-label="Этапы подключения">
            <span className="done">
              <b>✓</b>
              <i>{t("adminDashboardStep")}</i>
            </span>
            <span className={activeCommunities.length ? "done" : "current"}>
              <b>{activeCommunities.length ? "✓" : "2"}</b>
              <i>{t("chooseTelegramGroup")}</i>
            </span>
            <span
              className={
                readyCommunities
                  ? "done"
                  : activeCommunities.length
                    ? "current"
                    : ""
              }
            >
              <b>{readyCommunities ? "✓" : "3"}</b>
              <i>{t("rulesAndLaunch")}</i>
            </span>
          </div>
        </section>
      )}
      {!platformAdminOnly && ownerTab === "overview" && (
        <section className="owner-overview" aria-label="Сводка кабинета">
          <div className="owner-kpis">
            <article>
              <b>{ownerCommunities.length}</b>
              <span>Всего сообществ</span>
            </article>
            <article>
              <b>{activeCommunities.length}</b>
              <span>{t("connectedGroups")}</span>
            </article>
            <article>
              <b>{readyCommunities}</b>
              <span>{t("readyToWork")}</span>
            </article>
            <article>
              <b>{totalListings}</b>
              <span>{t("listings")}</span>
            </article>
          </div>
          <div className="owner-next-step">
            <span>
              {!activeCommunities.length
                ? "2"
                : readyCommunities < activeCommunities.length
                  ? "3"
                  : "✓"}
            </span>
            <div>
              <small>{t("nextStep")}</small>
              <b>
                {!activeCommunities.length
                  ? t("addBotNext")
                  : readyCommunities < activeCommunities.length
                    ? t("finishBoardSettings")
                    : t("boardsReadyNext")}
              </b>
            </div>
          </div>
          <div className="owner-control-center">
            <header>
              <div>
                <small>ЦЕНТР УПРАВЛЕНИЯ</small>
                <h2>Что нужно сделать</h2>
              </div>
              <span>Все функции разнесены по отдельным разделам</span>
            </header>
            <div>
              <a href="/owner?tab=moderation">
                <b>✓ Модерация</b>
                <span>Проверить новые объявления и принять решение</span>
              </a>
              <a href="/owner?tab=users">
                <b>♙ Люди и роли</b>
                <span>Администраторы, ограничения и бесплатный доступ</span>
              </a>
              <a href="/owner?tab=settings">
                <b>⚙ Настройки</b>
                <span>Правила, безопасность, язык и параметры доски</span>
              </a>
              <a href="/owner?tab=finance">
                <b>★ Stars и выплаты</b>
                <span>Цены, комиссии, баланс и история операций</span>
              </a>
            </div>
          </div>
        </section>
      )}
      {error && <LoadError message={error} />}
      {!platformAdminOnly && administrationTabs.has(ownerTab) && (
        <WebCommunityAdministration
          view={ownerTab}
          communities={ownerCommunities}
          selectedCommunityId={selectedCommunityId}
        />
      )}
      {!platformAdminOnly &&
        ["communities", "finance", "support"].includes(ownerTab) && (
          <div className="organization-list" id="owner-communities">
            {data.organizations.map(
              (organization: any, organizationIndex: number) => (
                <section className="organization-card" key={organization.id}>
                  <div className="organization-title">
                    <div>
                      <small>УПРАВЛЕНИЕ ПОДКЛЮЧЕНИЯМИ</small>
                      <h2>Сообщества</h2>
                    </div>
                  </div>
                  {ownerTab === "communities" && (
                    <div className="connected-boards">
                      {organization.communities.map((community: any) => (
                        <CommunityOperations
                          key={community.id}
                          community={community}
                          canManage={["owner", "administrator"].includes(
                            organization.role,
                          )}
                          canDelete={organization.role === "owner"}
                          onChanged={load}
                        />
                      ))}
                      {!organization.communities.length && (
                        <div className="owner-empty-community">
                          <span>▦</span>
                          <div>
                            <b>{t("noTelegramGroups")}</b>
                            <small>
                              Подключите первую Telegram-группу — отдельное
                              рабочее пространство создавать не нужно.
                            </small>
                          </div>
                          {["owner", "administrator"].includes(
                            organization.role,
                          ) && (
                            <button
                              className="primary"
                              disabled={busy === organization.id}
                              onClick={() => void connect(organization.id)}
                            >
                              {busy === organization.id
                                ? t("openingTelegram")
                                : t("connectGroup")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {["owner", "administrator"].includes(organization.role) &&
                    ownerTab === "communities" &&
                    organization.communities.length > 0 && (
                      <OwnerLocalization
                        communities={organization.communities}
                        onChanged={load}
                      />
                    )}
                  {organization.role === "owner" &&
                    ownerTab === "finance" &&
                    organization.communities.length > 0 && (
                      <OwnerMonetization
                        organization={organization}
                        pricing={data.platformPricing}
                        onChanged={load}
                      />
                    )}
                  {ownerTab === "finance" &&
                    organization.communities.length > 0 && (
                      <div
                        id={
                          organizationIndex === 0 ? "owner-finance" : undefined
                        }
                      >
                        <OrganizationFinance organizationId={organization.id} />
                      </div>
                    )}
                  {ownerTab === "support" && (
                    <div
                      id={organizationIndex === 0 ? "owner-support" : undefined}
                    >
                      <OrganizationSupport organization={organization} />
                    </div>
                  )}
                  {ownerTab === "communities" &&
                    organization.role === "owner" && (
                      <button
                        type="button"
                        className="ownership-transfer"
                        disabled={busy === `transfer-${organization.id}`}
                        onClick={async () => {
                          const telegramUserId = window.prompt(
                            "Telegram ID нового владельца. Он должен сначала открыть бота.",
                          );
                          if (!telegramUserId) return;
                          if (
                            !window.confirm(
                              "После передачи вы станете администратором. Продолжить?",
                            )
                          )
                            return;
                          setBusy(`transfer-${organization.id}`);
                          setError("");
                          try {
                            await request(
                              `/platform/organizations/${organization.id}/transfer-ownership`,
                              "POST",
                              { telegramUserId },
                            );
                            await load();
                          } catch (e: any) {
                            setError(e.message);
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        Передать права владельца
                      </button>
                    )}
                  {ownerTab === "communities" &&
                    organization.communities.length > 0 && (
                      <button
                        className="primary connect-community"
                        disabled={busy === organization.id}
                        onClick={() => void connect(organization.id)}
                      >
                        {busy === organization.id
                          ? "Создаём ссылку…"
                          : organization.communities.some(
                                (community: any) =>
                                  community.botStatus === "unavailable",
                              )
                            ? "＋ Подключить Adnecta к группе"
                            : "＋ Добавить Adnecta в группу"}
                      </button>
                    )}
                </section>
              ),
            )}
          </div>
        )}
      {!platformAdminOnly &&
        ["platform_admin", "platform_owner"].includes(
          data.user.platformRole,
        ) && (
          <a className="platform-console-link" href="/platform-owner">
            <b>Перейти в кабинет владельца платформы</b>
            <span>Сообщества, Stars, выплаты и аудит →</span>
          </a>
        )}
      {platformAdminOnly &&
        ["platform_admin", "platform_owner"].includes(
          data.user.platformRole,
        ) && (
          <PlatformOwnerPanel
            canEdit={data.user.platformRole === "platform_owner"}
          />
        )}
      {platformAdminOnly && data.user.platformRole === "support" && (
        <PlatformSupportPanel />
      )}
      {platformAdminOnly && data.user.platformRole === "finance" && (
        <PlatformFinancePanel />
      )}
      {platformAdminOnly &&
        !["platform_admin", "platform_owner", "support", "finance"].includes(
          data.user.platformRole,
        ) && (
          <LoadError message="Этот отдельный кабинет доступен только владельцу и сотрудникам платформы." />
        )}
    </main>
  );
}

function WebCommunityAdministration({
  view,
  communities,
  selectedCommunityId,
}: {
  view: string;
  communities: any[];
  selectedCommunityId: string;
}) {
  useEffect(() => {
    setAdminCommunityId(selectedCommunityId);
    return () => setAdminCommunityId("");
  }, [selectedCommunityId]);
  if (!communities.length)
    return (
      <section className="web-community-admin admin-page">
        <div className="admin-empty">
          Сначала подключите Telegram-сообщество в разделе «Сообщества».
        </div>
      </section>
    );
  return (
    <section className="web-community-admin admin-page">
      <header className="admin-header web-admin-header">
        <div>
          <small>АДМИНИСТРИРОВАНИЕ СООБЩЕСТВА</small>
          <h2>
            {communities.find(
              (community) => community.id === selectedCommunityId,
            )?.name || "Сообщество"}
          </h2>
        </div>
        <label>
          <span>Сообщество</span>
          <select
            value={selectedCommunityId}
            onChange={(event) => {
              const url = new URL(window.location.href);
              url.searchParams.set("community", event.target.value);
              window.location.assign(url.toString());
            }}
          >
            {communities.map((community) => (
              <option value={community.id} key={community.id}>
                {community.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {view === "moderation" && <AdminModeration />}
      {view === "reports" && <AdminReports />}
      {view === "users" && <AdminUsers />}
      {view === "categories" && <AdminCategories />}
      {view === "risk" && <AdminRisk />}
      {view === "settings" && <AdminSettings />}
      {view === "audit" && <AdminAudit />}
    </section>
  );
}

function OwnerLocalization({
  communities,
  onChanged,
}: {
  communities: any[];
  onChanged: () => Promise<any>;
}) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      communities.map((community) => [
        community.id,
        community.defaultLocale || "en",
      ]),
    ),
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  return (
    <section className="owner-localization">
      <div>
        <small>{t("language").toLocaleUpperCase()}</small>
        <h3>{t("boardLanguage")}</h3>
        <p>{t("boardLanguageHint")}</p>
      </div>
      {communities.map((community) => (
        <form
          key={community.id}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(community.id);
            setMessage("");
            try {
              await request(
                `/platform/communities/${community.id}/localization`,
                "PATCH",
                { defaultLocale: drafts[community.id] },
              );
              setMessage(t("languageSaved"));
              await onChanged();
            } catch (error: any) {
              setMessage(error.message);
            } finally {
              setBusy("");
            }
          }}
        >
          <label>
            {community.name}
            <select
              value={drafts[community.id] || "en"}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [community.id]: event.target.value,
                }))
              }
            >
              {supportedLanguages.map(([code, name]) => (
                <option value={code} key={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={Boolean(busy)}>
            {busy === community.id ? t("saving") : t("saveLanguage")}
          </button>
        </form>
      ))}
      {message && <p className="platform-message">{message}</p>}
    </section>
  );
}

function OrganizationIdentitySettings({
  organization,
  onChanged,
}: {
  organization: any;
  onChanged: () => Promise<any>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organization.name);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const rename = async (event: any) => {
    event.preventDefault();
    setBusy("rename");
    setError("");
    try {
      await request(`/platform/organizations/${organization.id}`, "PATCH", {
        name,
      });
      setEditing(false);
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    const confirmation = window.prompt(
      "Удалить пустую запись без возможности восстановления? Введите DELETE:",
    );
    if (confirmation !== "DELETE") return;
    setBusy("delete");
    setError("");
    try {
      await request(`/platform/organizations/${organization.id}`, "DELETE", {
        confirmation,
      });
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="organization-identity-settings">
      {editing ? (
        <form onSubmit={rename}>
          <label>
            Название
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <button className="primary" disabled={Boolean(busy)}>
            {busy === "rename" ? "Сохраняем…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => {
              setName(organization.name);
              setEditing(false);
            }}
          >
            Отмена
          </button>
        </form>
      ) : (
        <div>
          <button type="button" onClick={() => setEditing(true)}>
            ✎ Переименовать
          </button>
          {!organization.communities.length && (
            <button
              type="button"
              className="danger-link"
              disabled={Boolean(busy)}
              onClick={() => void remove()}
            >
              {busy === "delete" ? "Удаляем…" : "Удалить пустую запись"}
            </button>
          )}
        </div>
      )}
      {error && <LoadError message={error} />}
    </div>
  );
}

function LegalAcceptance({
  documents,
  onAccepted,
}: {
  documents: any[];
  onAccepted: () => Promise<any>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="legal-acceptance">
      <section>
        <small>ВАЖНО</small>
        <h1>Условия закрытой beta</h1>
        <p>
          Перед созданием и управлением сообществом ознакомьтесь с актуальными
          документами.
        </p>
        <div>
          {documents.map((document) => (
            <a
              key={document.id}
              href={`/${document.type}`}
              target="_blank"
              rel="noreferrer"
            >
              <span>{document.title}</span>
              <small>Версия {document.version} ↗</small>
            </a>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Я прочитал(а) и принимаю все указанные документы
        </label>
        {error && <LoadError message={error} />}
        <button
          className="primary"
          disabled={!confirmed || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await request("/platform/legal/accept", "POST", {
                documentIds: documents.map((document) => document.id),
              });
              await onAccepted();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Сохраняем…" : "Принять и продолжить"}
        </button>
      </section>
    </main>
  );
}

function OwnerMonetization({
  organization,
  pricing,
  onChanged,
}: {
  organization: any;
  pricing: any;
  onChanged: () => Promise<any>;
}) {
  const [drafts, setDrafts] = useState<Record<string, any>>(
    Object.fromEntries(
      organization.communities.map((community: any) => [
        community.id,
        {
          monetizationMode: community.monetizationMode || "hybrid",
          publicationPriceStars:
            community.publicationPriceStars || pricing.minimumPublicationStars,
          minMonthlyMessagesForFree: community.minMonthlyMessagesForFree || 10,
          activityWindowDays: community.activityWindowDays || 30,
          allowPaidNonMembers: community.allowPaidNonMembers ?? true,
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const subscriptionActive =
    organization.starsSubscriptionStatus === "active" &&
    organization.starsSubscriptionExpiresAt &&
    new Date(organization.starsSubscriptionExpiresAt) > new Date();
  const update = (communityId: string, patch: any) =>
    setDrafts((current) => ({
      ...current,
      [communityId]: { ...current[communityId], ...patch },
    }));
  const subscribe = async () => {
    setBusy("subscription");
    setMessage("");
    try {
      const result = await request(
        `/platform/organizations/${organization.id}/stars-subscription-link`,
        "POST",
        {},
      );
      window.location.href = result.invoiceUrl;
    } catch (e: any) {
      setMessage(e.message);
      setBusy("");
    }
  };
  const save = async (communityId: string) => {
    setBusy(communityId);
    setMessage("");
    try {
      await request(
        `/platform/communities/${communityId}/monetization`,
        "PATCH",
        drafts[communityId],
      );
      setMessage("✓ Модель публикаций сохранена");
      await onChanged();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="organization-billing">
      <div className="finance-summary">
        <span>
          <small>МОНЕТИЗАЦИЯ В STARS</small>
          <b>15% платформе · 85% сообществу</b>
        </span>
      </div>
      <div className="billing-details">
        <div className="connect-status">
          <b>Подписка бесплатной доски</b>
          <small>
            {subscriptionActive
              ? `Активна до ${new Date(organization.starsSubscriptionExpiresAt).toLocaleDateString("ru")}`
              : "Нужна только если публикации бесплатны абсолютно для всех"}
          </small>
          <strong>{pricing.freeBoardSubscriptionStars} ⭐ / 30 дней</strong>
          {!subscriptionActive && (
            <button
              className="primary"
              disabled={Boolean(busy)}
              onClick={() => void subscribe()}
            >
              {busy === "subscription" ? "Создаём счёт…" : "Оформить подписку"}
            </button>
          )}
        </div>
        {organization.communities.map((community: any) => {
          const draft = drafts[community.id];
          if (!draft) return null;
          return (
            <form
              key={community.id}
              className="platform-settings"
              onSubmit={(event) => {
                event.preventDefault();
                void save(community.id);
              }}
            >
              <h4>{community.name}</h4>
              <label>
                Кто оплачивает публикацию
                <select
                  value={draft.monetizationMode}
                  onChange={(e) =>
                    update(community.id, { monetizationMode: e.target.value })
                  }
                >
                  <option value="paid_all">Все пользователи платят</option>
                  <option value="hybrid">
                    Активные бесплатно, остальные платят
                  </option>
                  <option
                    value="free_subscription"
                    disabled={!subscriptionActive}
                  >
                    Бесплатно всем — по подписке владельца
                  </option>
                </select>
              </label>
              {draft.monetizationMode !== "free_subscription" && (
                <label>
                  Цена публикации, Stars
                  <input
                    type="number"
                    min={pricing.minimumPublicationStars}
                    max="10000"
                    value={draft.publicationPriceStars}
                    onChange={(e) =>
                      update(community.id, {
                        publicationPriceStars: Number(e.target.value),
                      })
                    }
                  />
                  <small>
                    Минимум платформы — {pricing.minimumPublicationStars} ⭐
                  </small>
                </label>
              )}
              {draft.monetizationMode === "hybrid" && (
                <>
                  <label>
                    Сообщений для бесплатной публикации
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={draft.minMonthlyMessagesForFree}
                      onChange={(e) =>
                        update(community.id, {
                          minMonthlyMessagesForFree: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Период активности
                    <select
                      value={draft.activityWindowDays}
                      onChange={(e) =>
                        update(community.id, {
                          activityWindowDays: Number(e.target.value),
                        })
                      }
                    >
                      <option value={7}>7 дней</option>
                      <option value={30}>30 дней</option>
                      <option value={90}>90 дней</option>
                    </select>
                  </label>
                </>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.allowPaidNonMembers}
                  onChange={(e) =>
                    update(community.id, {
                      allowPaidNonMembers: e.target.checked,
                    })
                  }
                />
                Разрешить платные объявления людям не из группы
              </label>
              <button className="primary" disabled={Boolean(busy)}>
                {busy === community.id ? "Сохраняем…" : "Сохранить модель"}
              </button>
            </form>
          );
        })}
        {message && <p className="platform-message">{message}</p>}
      </div>
    </section>
  );
}

function OrganizationBilling({ organization }: { organization: any }) {
  const [billing, setBilling] = useState<any>();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () =>
    request(`/platform/organizations/${organization.id}/billing`).then(
      setBilling,
    );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [organization.id]);
  const openExternal = (url: string) => {
    if (window.Telegram?.WebApp.openLink) window.Telegram.WebApp.openLink(url);
    else window.location.href = url;
  };
  const action = async (name: string, path: string, body: any = {}) => {
    setBusy(name);
    setError("");
    try {
      const result = await request(path, "POST", body);
      if (result?.url) openExternal(result.url);
      else await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  if (!billing && !error) return null;
  return (
    <section className="organization-billing">
      <button
        type="button"
        className="finance-summary"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <small>STRIPE BILLING</small>
          <b>
            {billing?.subscription.status === "active"
              ? `Тариф ${billing.subscription.planKey || "active"}`
              : "Без подписки"}
          </b>
        </span>
        <i>{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="billing-details">
          {error && <LoadError message={error} />}
          {!billing?.configured && (
            <div className="billing-unavailable">
              <b>Stripe готов к подключению</b>
              <small>
                Владелец платформы должен добавить API ключи и Price ID.
              </small>
            </div>
          )}
          {billing?.plans.map((plan: any) => (
            <article className="billing-plan" key={plan.id}>
              <span>
                <b>{plan.name}</b>
                <small>{plan.description}</small>
                <strong>
                  {(plan.unitAmount / 100).toLocaleString("ru", {
                    style: "currency",
                    currency: plan.currency.toUpperCase(),
                  })}{" "}
                  / {plan.interval === "month" ? "месяц" : plan.interval}
                </strong>
              </span>
              <ul>
                {(plan.features || []).map((feature: string) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
              {organization.role === "owner" && (
                <button
                  className="primary"
                  disabled={
                    Boolean(busy) ||
                    !plan.available ||
                    ["active", "trialing"].includes(billing.subscription.status)
                  }
                  onClick={() =>
                    void action(
                      plan.key,
                      `/platform/organizations/${organization.id}/billing/checkout`,
                      { planKey: plan.key },
                    )
                  }
                >
                  {busy === plan.key ? "Открываем…" : "Выбрать"}
                </button>
              )}
            </article>
          ))}
          {organization.role === "owner" &&
            billing?.subscription.customerReady && (
              <button
                disabled={Boolean(busy)}
                onClick={() =>
                  void action(
                    "portal",
                    `/platform/organizations/${organization.id}/billing/portal`,
                  )
                }
              >
                Управлять подпиской в Stripe
              </button>
            )}
          <div className="connect-status">
            <b>Выплаты сообществу</b>
            <small>
              {billing?.connect.payoutsEnabled
                ? "✓ Stripe Connect готов к выплатам"
                : billing?.connect.detailsSubmitted
                  ? "Stripe проверяет данные"
                  : "Пройдите защищённую проверку Stripe"}
            </small>
            {billing?.connect.requirementsDue?.length > 0 && (
              <small>
                Нужно заполнить: {billing.connect.requirementsDue.length}
              </small>
            )}
          </div>
          {organization.role === "owner" && (
            <button
              className="primary"
              disabled={Boolean(busy) || !billing?.configured}
              onClick={() =>
                void action(
                  "connect",
                  `/platform/organizations/${organization.id}/connect/onboarding`,
                )
              }
            >
              {billing?.connect.accountCreated
                ? "Продолжить проверку Stripe"
                : "Подключить Stripe Connect"}
            </button>
          )}
          {billing?.connect.accountCreated && (
            <button
              disabled={Boolean(busy) || !billing?.configured}
              onClick={() =>
                void action(
                  "refresh",
                  `/platform/organizations/${organization.id}/connect/refresh`,
                )
              }
            >
              Обновить статус
            </button>
          )}
          {billing?.invoices.length > 0 && (
            <div className="billing-invoices">
              <b>Счета</b>
              {billing.invoices.map((invoice: any) => (
                <p key={invoice.id}>
                  <span>
                    {new Date(invoice.createdAt).toLocaleDateString("ru")} ·{" "}
                    {invoice.status}
                  </span>
                  <b>
                    {(invoice.amountPaid / 100).toLocaleString("ru", {
                      style: "currency",
                      currency: invoice.currency.toUpperCase(),
                    })}
                  </b>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CommunityOperations({
  community,
  canManage,
  canDelete,
  onChanged,
}: {
  community: any;
  canManage: boolean;
  canDelete: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [exported, setExported] = useState(false);
  const setup = community.setup || {};
  const setupItems = [
    [setup.connected, "Бот в группе"],
    [setup.administrator, "Бот — администратор"],
    [setup.permissions, "Выданы нужные права"],
    [setup.rules, "Опубликованы правила"],
    [setup.branding, "Добавлено описание"],
  ];
  const completed = setupItems.filter(([done]) => done).length;
  const run = async (name: string, path: string, body: any = {}) => {
    setBusy(name);
    setError("");
    try {
      await request(path, "POST", body);
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const exportData = async () => {
    setBusy("export");
    setError("");
    try {
      const data = await request(
        `/platform/communities/${community.id}/export`,
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${community.slug}-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExported(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <article className="community-operations">
      <button
        className="community-summary"
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <b>{community.name}</b>
          <small
            className={
              community.tenantStatus === "active"
                ? "status-active"
                : "status-warning"
            }
          >
            {community.tenantStatus === "active"
              ? "● Работает"
              : community.botStatus === "unavailable"
                ? "● Adnecta не подключена"
                : community.tenantStatus === "closed"
                  ? "● Отключено"
                  : "● Требует подключения"}
          </small>
        </span>
        <i>{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="community-details">
          <div className="setup-progress">
            <span>
              <b>Готовность</b>
              <small>
                {completed} из {setupItems.length} шагов
              </small>
            </span>
            <strong>
              {Math.round((completed / setupItems.length) * 100)}%
            </strong>
          </div>
          <div className="setup-list">
            {setupItems.map(([done, label]) => (
              <span key={String(label)} className={done ? "done" : ""}>
                {done ? "✓" : "·"} {label}
              </span>
            ))}
          </div>
          <div className="community-numbers">
            <span>
              {community._count?.members || 0}
              <small>Участников</small>
            </span>
            <span>
              {community._count?.listings || 0}
              <small>Объявлений</small>
            </span>
          </div>
          {community.tenantStatus === "active" && setup.connected ? (
            <a
              className="open-board-link"
              href={`/?community=${encodeURIComponent(community.slug)}`}
            >
              Открыть доску →
            </a>
          ) : (
            <div className="community-reconnect-note">
              <b>Telegram-подключение отсутствует</b>
              <small>
                Нажмите «Подключить Adnecta к группе» ниже и выберите эту же
                группу. Настройки и объявления сохранятся.
              </small>
            </div>
          )}
          {error && <LoadError message={error} />}
          {community.deletionScheduledFor && (
            <div className="deletion-warning">
              <b>Удаление запланировано</b>
              <small>
                Данные будут удалены не ранее{" "}
                {new Date(community.deletionScheduledFor).toLocaleDateString(
                  "ru",
                )}
                .
              </small>
              {canDelete && (
                <button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      "cancel-delete",
                      `/platform/communities/${community.id}/cancel-deletion`,
                    )
                  }
                >
                  Отменить удаление
                </button>
              )}
            </div>
          )}
          {canManage && (
            <div className="community-tools">
              <button
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(
                    "check",
                    `/platform/communities/${community.id}/connection-check`,
                  )
                }
              >
                {busy === "check" ? "Проверяем…" : "Проверить бота"}
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => void exportData()}
              >
                {busy === "export" ? "Готовим…" : "Скачать экспорт"}
              </button>
              {community.botStatus ===
              "unavailable" ? null : community.tenantStatus === "closed" ? (
                <button
                  className="primary"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      "reconnect",
                      `/platform/communities/${community.id}/reconnect`,
                    )
                  }
                >
                  Включить снова
                </button>
              ) : (
                <button
                  className="danger-soft"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Доска перестанет обслуживать группу. Данные сохранятся. Отключить?",
                      )
                    )
                      void run(
                        "disconnect",
                        `/platform/communities/${community.id}/disconnect`,
                        { confirmation: "DISCONNECT" },
                      );
                  }}
                >
                  Отключить доску
                </button>
              )}
              {canDelete && !community.deletionScheduledFor && (
                <button
                  className="delete-request"
                  disabled={Boolean(busy) || !exported}
                  title={exported ? "" : "Сначала скачайте экспорт"}
                  onClick={() => {
                    const confirmation = window.prompt(
                      "Данные будут удалены через 30 дней. Введите DELETE:",
                    );
                    if (confirmation === "DELETE")
                      void run(
                        "delete",
                        `/platform/communities/${community.id}/request-deletion`,
                        { confirmation, exportAcknowledged: true },
                      );
                  }}
                >
                  Запросить удаление
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function OrganizationFinance({ organizationId }: { organizationId: string }) {
  const [finance, setFinance] = useState<any>();
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const load = () =>
    request(`/platform/organizations/${organizationId}/finance`).then(
      setFinance,
    );
  useEffect(() => {
    load().catch(() => undefined);
  }, [organizationId]);
  if (!finance) return null;
  return (
    <section className="organization-finance">
      <button
        type="button"
        className="finance-summary"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <small>НАЧИСЛЕНО СООБЩЕСТВУ</small>
          <b>{finance.balances.pending + finance.balances.available} ⭐</b>
        </span>
        <i>{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="finance-details">
          <div>
            <span>Ожидает разблокировки</span>
            <b>
              {finance.balances.pending} ⭐{" "}
              <small>
                ≈ {estimatedTon(finance.balances.pending, finance.tonRate)}
              </small>
            </b>
          </div>
          <p className="muted">
            Холд Telegram: {finance.holdDays} день. После этой даты
            подтверждённые начисления автоматически переходят в доступные.
          </p>
          <div>
            <span>Доступно к выплате</span>
            <b>
              {finance.balances.available} ⭐{" "}
              <small>
                ≈ {estimatedTon(finance.balances.available, finance.tonRate)}
              </small>
            </b>
          </div>
          <div>
            <span>Зарезервировано</span>
            <b>
              {finance.balances.reserved} ⭐{" "}
              <small>
                ≈ {estimatedTon(finance.balances.reserved, finance.tonRate)}
              </small>
            </b>
          </div>
          <div>
            <span>Выплачено</span>
            <b>
              {finance.balances.paidOut} ⭐{" "}
              <small>по фактическим TON-переводам</small>
            </b>
          </div>
          <p className="muted">
            Оценка: 1 ⭐ = ${finance.tonRate.starUsd} вознаграждения, TON/USD =
            ${finance.tonRate.tonUsd?.toFixed(4) || "—"}. Обновлено{" "}
            {new Date(finance.tonRate.updatedAt).toLocaleString("ru")}.
            Финальная сумма фиксируется при выплате.
          </p>
          {finance.payoutsEnabled ? (
            <form
              className="payout-request"
              onSubmit={async (event) => {
                event.preventDefault();
                setMessage("");
                try {
                  await request(
                    `/platform/organizations/${organizationId}/payouts`,
                    "POST",
                    { amountStars: Number(amount) },
                  );
                  setAmount("");
                  setMessage("✓ Заявка создана, Stars зарезервированы");
                  await load();
                } catch (e: any) {
                  setMessage(e.message);
                }
              }}
            >
              <label>
                Запросить выплату
                <input
                  type="number"
                  min={finance.minimumPayoutStars}
                  max={finance.balances.available}
                  placeholder={`от ${finance.minimumPayoutStars} Stars`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={
                  !amount || Number(amount) > finance.balances.available
                }
              >
                Отправить заявку
              </button>
            </form>
          ) : (
            <p className="muted">
              Выплаты откроются после проверки платёжного контура платформы.
            </p>
          )}
          {message && <p className="platform-message">{message}</p>}
          <h4>Заявки на выплату</h4>
          {finance.payouts.map((payout: any) => (
            <p key={payout.id}>
              <span>
                {payout.status}
                <small>
                  {new Date(payout.requestedAt).toLocaleDateString("ru")}
                  {payout.tonTransactionHash
                    ? ` · TON tx ${payout.tonTransactionHash}`
                    : ""}
                </small>
              </span>
              <b>
                {payout.amountStars} ⭐{" "}
                <small>
                  {payout.settlementTonNano
                    ? `→ ${actualTon(payout.settlementTonNano)}`
                    : `≈ ${estimatedTon(payout.amountStars, finance.tonRate)}`}
                </small>
              </b>
            </p>
          ))}
          <h4>Последние операции</h4>
          {finance.transactions.slice(0, 10).map((transaction: any) => (
            <p key={transaction.id}>
              <span>
                {transaction.community?.name || "Сообщество"}
                <small>
                  {transaction.status === "pending_settlement"
                    ? `Доступно с ${new Date(transaction.availableAt).toLocaleDateString("ru")}`
                    : new Date(transaction.occurredAt).toLocaleDateString("ru")}
                </small>
              </span>
              <b>
                +{transaction.payment?.communityShareStars || 0} ⭐{" "}
                <small>
                  ≈{" "}
                  {estimatedTon(
                    transaction.payment?.communityShareStars || 0,
                    finance.tonRate,
                  )}
                </small>
              </b>
            </p>
          ))}
          {!finance.transactions.length && (
            <p className="muted">Платных публикаций пока нет.</p>
          )}
        </div>
      )}
    </section>
  );
}

function OrganizationSupport({ organization }: { organization: any }) {
  const [expanded, setExpanded] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    request(`/platform/organizations/${organization.id}/support`).then(
      setTickets,
    );
  useEffect(() => {
    void load().catch(() => undefined);
  }, [organization.id]);
  const create = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(
        `/platform/organizations/${organization.id}/support`,
        "POST",
        {
          subject,
          message,
          communityId: organization.communities[0]?.id,
        },
      );
      setSubject("");
      setMessage("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const reply = async (ticket: any) => {
    const text = window.prompt("Ваш ответ поддержке:");
    if (!text) return;
    setBusy(true);
    try {
      await request(`/platform/support/${ticket.id}/messages`, "POST", {
        message: text,
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="organization-support">
      <button
        type="button"
        className="finance-summary"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <small>ПОДДЕРЖКА</small>
          <b>
            {
              tickets.filter(
                (ticket) => !["resolved", "closed"].includes(ticket.status),
              ).length
            }{" "}
            активных
          </b>
        </span>
        <i>{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="support-details">
          {error && <LoadError message={error} />}
          {tickets.map((ticket) => (
            <article className="support-ticket" key={ticket.id}>
              <header>
                <b>{ticket.subject}</b>
                <small>{ticket.status}</small>
              </header>
              {ticket.messages.map((item: any) => (
                <p key={item.id}>
                  <b>{item.author.firstName}</b>
                  <span>{item.body}</span>
                  <small>{new Date(item.createdAt).toLocaleString("ru")}</small>
                </p>
              ))}
              {!["resolved", "closed"].includes(ticket.status) && (
                <button disabled={busy} onClick={() => void reply(ticket)}>
                  Ответить
                </button>
              )}
            </article>
          ))}
          <form className="support-form" onSubmit={create}>
            <b>Новое обращение</b>
            <input
              value={subject}
              maxLength={160}
              minLength={3}
              required
              placeholder="Тема"
              onChange={(event) => setSubject(event.target.value)}
            />
            <textarea
              value={message}
              maxLength={5000}
              minLength={5}
              required
              rows={4}
              placeholder="Опишите вопрос"
              onChange={(event) => setMessage(event.target.value)}
            />
            <button className="primary" disabled={busy}>
              {busy ? "Отправляем…" : "Отправить"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function PlatformSupportPanel() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => request("/platform/admin/support").then(setTickets);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const update = async (ticket: any, status: string) => {
    setBusy(ticket.id);
    setError("");
    try {
      await request(`/platform/admin/support/${ticket.id}`, "PATCH", {
        status,
        assignToMe: true,
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const reply = async (ticket: any) => {
    const message = window.prompt("Ответ клиенту:");
    if (!message) return;
    setBusy(ticket.id);
    try {
      await request(`/platform/support/${ticket.id}/messages`, "POST", {
        message,
      });
      await update(ticket, "waiting_customer");
    } catch (e: any) {
      setError(e.message);
      setBusy("");
    }
  };
  return (
    <section className="platform-admin platform-support">
      <small>СЕРВИС</small>
      <h2>Обращения клиентов</h2>
      {error && <LoadError message={error} />}
      {tickets.map((ticket) => (
        <article className="staff-ticket" key={ticket.id}>
          <header>
            <span>
              <b>{ticket.subject}</b>
              <small>
                {ticket.organization.name} · {ticket.priority} · {ticket.status}
              </small>
            </span>
          </header>
          <div>
            {ticket.messages.map(
              (item: any) =>
                !item.internal && (
                  <p key={item.id}>
                    <b>{item.author.firstName}</b>
                    <span>{item.body}</span>
                  </p>
                ),
            )}
          </div>
          <footer>
            <button
              disabled={busy === ticket.id}
              onClick={() => void update(ticket, "in_progress")}
            >
              Взять
            </button>
            <button
              disabled={busy === ticket.id}
              onClick={() => void reply(ticket)}
            >
              Ответить
            </button>
            <button
              disabled={busy === ticket.id}
              onClick={() => void update(ticket, "resolved")}
            >
              Решено
            </button>
          </footer>
        </article>
      ))}
      {!tickets.length && !error && (
        <p className="muted">Обращений пока нет.</p>
      )}
    </section>
  );
}

function PlatformFinancePanel() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [tonRate, setTonRate] = useState<any>();
  useEffect(() => {
    Promise.all([
      request("/platform/admin/ledger?limit=100"),
      request("/platform/admin/payouts"),
      request("/public/ton-rate"),
    ])
      .then(([ledgerItems, payoutItems, rate]) => {
        setLedger(ledgerItems);
        setPayouts(payoutItems);
        setTonRate(rate);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="platform-admin">
      <small>ФИНАНСЫ</small>
      <h2>Финансовый контроль</h2>
      {error && <LoadError message={error} />}
      <h3>Telegram Stars ledger</h3>
      <div className="global-audit">
        {ledger.map((item) => (
          <p key={item.id}>
            <span>
              <b>{item.type}</b>
              <small>
                {item.organization?.name || "Платформа"} · {item.status}
              </small>
            </span>
            <time>
              {item.grossAmount} ⭐{" "}
              <small>≈ {estimatedTon(item.grossAmount, tonRate)}</small>
            </time>
          </p>
        ))}
      </div>
      <h3>Заявки на выплату</h3>
      <div className="global-audit">
        {payouts.map((item) => (
          <p key={item.id}>
            <span>
              <b>{item.organization.name}</b>
              <small>
                {item.status} · {item.rail}
              </small>
            </span>
            <time>
              {item.amountStars} ⭐{" "}
              <small>
                {item.settlementTonNano
                  ? actualTon(item.settlementTonNano)
                  : `≈ ${estimatedTon(item.amountStars, tonRate)}`}
              </small>
            </time>
          </p>
        ))}
      </div>
      {!ledger.length && !error && (
        <p className="muted">Финансовых событий пока нет.</p>
      )}
    </section>
  );
}

function PlatformStaffManagement({ canEdit }: { canEdit: boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const load = async (query = "") => {
    const [userItems, auditItems] = await Promise.all([
      request(
        `/platform/admin/users${query ? `?search=${encodeURIComponent(query)}` : ""}`,
      ),
      request("/platform/admin/audit?limit=50"),
    ]);
    setUsers(userItems);
    setAudit(auditItems);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const find = async (event: any) => {
    event.preventDefault();
    setError("");
    try {
      await load(search);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const changeRole = async (user: any, platformRole: string) => {
    setError("");
    try {
      await request(`/platform/admin/users/${user.id}/role`, "PATCH", {
        platformRole,
      });
      await load(search);
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <>
      <h3>Сотрудники платформы</h3>
      <form className="staff-search" onSubmit={find}>
        <input
          value={search}
          placeholder="Имя, @username или Telegram ID"
          onChange={(event) => setSearch(event.target.value)}
        />
        <button>Найти</button>
      </form>
      {error && <LoadError message={error} />}
      <div className="staff-list">
        {users.map((user) => (
          <div key={user.id}>
            <span>
              <b>
                {user.firstName} {user.lastName || ""}
              </b>
              <small>
                @{user.username || "без username"} · {user.telegramUserId}
              </small>
            </span>
            <select
              disabled={!canEdit}
              value={user.platformRole}
              onChange={(event) => void changeRole(user, event.target.value)}
            >
              <option value="user">Пользователь</option>
              <option value="support">Поддержка</option>
              <option value="finance">Финансы</option>
              <option value="platform_admin">Админ</option>
              <option value="platform_owner">Владелец</option>
            </select>
          </div>
        ))}
      </div>
      <h3>Глобальный журнал</h3>
      <div className="global-audit">
        {audit.map((item) => (
          <p key={item.id}>
            <span>
              <b>{item.action}</b>
              <small>
                {item.actor?.firstName || "Система"} ·{" "}
                {item.community?.name || item.scope}
              </small>
            </span>
            <time>{new Date(item.createdAt).toLocaleString("ru")}</time>
          </p>
        ))}
      </div>
    </>
  );
}

function PlatformOwnerPanel({ canEdit }: { canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const [overview, setOverview] = useState<any>();
  const [communities, setCommunities] = useState<any[]>([]);
  const [minimumStars, setMinimumStars] = useState(100);
  const [commissionPercent, setCommissionPercent] = useState(15);
  const [holdDays, setHoldDays] = useState(21);
  const [minimumPayout, setMinimumPayout] = useState(2500);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [reconciliation, setReconciliation] = useState<any>();
  const [reliability, setReliability] = useState<any>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tonRate, setTonRate] = useState<any>();
  const [lastLoadedAt, setLastLoadedAt] = useState<Date>();
  const load = async () => {
    const [
      summary,
      tenantItems,
      ledgerItems,
      payoutItems,
      reliabilityStatus,
      rate,
    ] = await Promise.all([
      request("/platform/admin/overview"),
      request("/platform/admin/communities"),
      request("/platform/admin/ledger?limit=50"),
      request("/platform/admin/payouts"),
      request("/platform/admin/reliability"),
      request("/public/ton-rate"),
    ]);
    setOverview(summary);
    setCommunities(tenantItems);
    setMinimumStars(summary.settings.minimumPublicationStars);
    setCommissionPercent(summary.settings.defaultCommissionBps / 100);
    setHoldDays(summary.settings.starsHoldDays);
    setMinimumPayout(summary.settings.minimumPayoutStars);
    setPayoutsEnabled(summary.settings.payoutsEnabled);
    setLedger(ledgerItems);
    setPayouts(payoutItems);
    setReliability(reliabilityStatus);
    setTonRate(rate);
    setLastLoadedAt(new Date());
  };
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  const save = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await request("/platform/admin/settings", "PATCH", {
        minimumPublicationStars: Number(minimumStars),
        defaultCommissionBps: Math.round(Number(commissionPercent) * 100),
        starsHoldDays: Number(holdDays),
        minimumPayoutStars: Number(minimumPayout),
        payoutsEnabled,
      });
      setMessage("✓ Глобальные настройки сохранены");
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const reconcile = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await request(
        "/platform/admin/stars/reconcile",
        "POST",
        {},
      );
      setReconciliation(result);
      setMessage("✓ Telegram Stars сверены");
      await request("/platform/admin/stars/settle", "POST", {});
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const refund = async (payment: any) => {
    const reason = window.prompt("Причина возврата Stars пользователю:");
    if (!reason) return;
    setBusy(true);
    setMessage("");
    try {
      await request(`/platform/admin/payments/${payment.id}/refund`, "POST", {
        reason,
      });
      setMessage("✓ Stars возвращены, объявление скрыто");
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const toggleTenant = async (community: any) => {
    if (community.deletionScheduledFor || community.deletionFinalizedAt) {
      setMessage("Нельзя включить сообщество в процессе удаления");
      return;
    }
    const tenantStatus =
      community.tenantStatus === "active" ? "suspended" : "active";
    setMessage("");
    try {
      await request(
        `/platform/admin/communities/${community.id}/status`,
        "PATCH",
        { tenantStatus },
      );
      await load();
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const finalizeDeletion = async (community: any) => {
    if (!canEdit) return;
    const confirmation = window.prompt(
      `Необратимая финализация. Введите ID:\n${community.id}`,
    );
    if (confirmation !== community.id) return;
    setBusy(true);
    setMessage("");
    try {
      await request(
        `/platform/admin/communities/${community.id}/finalize-deletion`,
        "POST",
        { confirmation },
      );
      setMessage(
        "✓ Персональные данные сообщества удалены, финансовый аудит сохранён",
      );
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!overview)
    return (
      <section className="platform-admin">
        {message ? (
          <>
            <LoadError message={message} />
            <button
              className="primary"
              onClick={() => {
                setMessage("");
                void load().catch((e) => setMessage(e.message));
              }}
            >
              Повторить загрузку
            </button>
          </>
        ) : (
          <p>Загружаем панель платформы…</p>
        )}
      </section>
    );
  const metrics = overview.metrics;
  return (
    <section className="platform-admin" id="platform-overview">
      <small>{t("platformManagement")}</small>
      <div className="platform-title-row">
        <div>
          <h2>{t("platformPanel")}</h2>
          {lastLoadedAt && (
            <small>
              {t("refreshed")}{" "}
              {lastLoadedAt.toLocaleTimeString(i18n.language, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          )}
        </div>
        <button
          disabled={busy}
          onClick={() => void load().catch((e) => setMessage(e.message))}
        >
          ↻ {t("refresh")}
        </button>
      </div>
      <div className="platform-console-link">
        <b>{t("reviewModes")}</b>
        <span>
          <a href="/platform-owner">{t("platform")}</a> ·{" "}
          <a href="/owner">{t("communityAdminDashboard")}</a>
        </span>
      </div>
      <div className="platform-metrics">
        <div>
          <b>{metrics.organizations}</b>
          <span>Кабинетов клиентов</span>
        </div>
        <div>
          <b>{metrics.activeCommunities}</b>
          <span>Активных досок</span>
        </div>
        <div>
          <b>{metrics.users}</b>
          <span>Пользователей</span>
        </div>
        <div>
          <b>{metrics.grossStars} ⭐</b>
          <span>Валовый оборот</span>
        </div>
      </div>
      <div className="platform-metrics">
        <div>
          <b>{overview.finance.communityPendingStars} ⭐</b>
          <small>
            ≈ {estimatedTon(overview.finance.communityPendingStars, tonRate)}
          </small>
          <span>На холде 21 день</span>
        </div>
        <div>
          <b>{overview.finance.communityAvailableStars} ⭐</b>
          <small>
            ≈ {estimatedTon(overview.finance.communityAvailableStars, tonRate)}
          </small>
          <span>Доступно владельцам</span>
        </div>
        <div>
          <b>{overview.finance.communityReservedStars} ⭐</b>
          <small>
            ≈ {estimatedTon(overview.finance.communityReservedStars, tonRate)}
          </small>
          <span>В заявках</span>
        </div>
        <div>
          <b>{overview.finance.platformAvailableStars} ⭐</b>
          <small>
            ≈ {estimatedTon(overview.finance.platformAvailableStars, tonRate)}
          </small>
          <span>Доход платформы</span>
        </div>
      </div>
      {tonRate && (
        <p className="platform-message">
          Расчётный курс: 1 ⭐ = ${tonRate.starUsd}; TON/USD $
          {tonRate.tonUsd?.toFixed(4) || "недоступен"} · {tonRate.source} ·
          обновлено {new Date(tonRate.updatedAt).toLocaleString("ru")}.
          Фактическая выплата фиксируется отдельно.
        </p>
      )}
      {canEdit && (
        <form
          className="platform-settings"
          id="platform-settings"
          onSubmit={save}
        >
          <label>
            Минимальная цена публикации, Stars
            <input
              type="number"
              min="1"
              max="100000"
              value={minimumStars}
              onChange={(e) => setMinimumStars(Number(e.target.value))}
            />
          </label>
          <label>
            Комиссия платформы, %
            <input type="number" value={commissionPercent} disabled readOnly />
            <small>Фиксированная ставка: 15%</small>
          </label>
          <label>
            Срок разблокировки Stars, дней
            <input
              type="number"
              min="0"
              max="90"
              value={holdDays}
              onChange={(e) => setHoldDays(Number(e.target.value))}
            />
          </label>
          <label>
            Минимум для выплаты, Stars
            <input
              type="number"
              min="1"
              max="10000000"
              value={minimumPayout}
              onChange={(e) => setMinimumPayout(Number(e.target.value))}
            />
          </label>
          <label>
            Бесплатная доска, Stars / 30 дней
            <input
              type="number"
              value={overview.settings.freeBoardSubscriptionStars}
              disabled
              readOnly
            />
            <small>Фиксированный тариф: 750 ⭐</small>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={payoutsEnabled}
              onChange={(e) => setPayoutsEnabled(e.target.checked)}
            />
            Разрешить новые заявки на выплату
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
      )}
      {message && <p className="platform-message">{message}</p>}
      <h3 id="platform-health">Надёжность системы</h3>
      <div className="platform-tenants">
        {reliability?.jobs.map((job: any) => (
          <div key={job.jobName}>
            <span>
              <b>{job.jobName}</b>
              <small>
                {job.status} · обработано {job.processedCount} ·{" "}
                {job.durationMs ?? 0} мс
              </small>
            </span>
            <time>{new Date(job.startedAt).toLocaleString("ru")}</time>
          </div>
        ))}
        {!reliability?.jobs.length && (
          <p className="muted">Планировщик запускается…</p>
        )}
      </div>
      {reliability && (
        <p className="platform-message">
          Уведомления в очереди: {reliability.notifications.pending} ·
          dead-letter: {reliability.notifications.deadLetter} · открытых
          алертов: {reliability.alerts.length}
        </p>
      )}
      <PlatformLegalManagement canEdit={canEdit} />
      <div className="platform-stars-tools" id="platform-finance">
        <span>
          <b>Сверка Telegram Stars</b>
          <small>
            Сопоставляет баланс Telegram с внутренним журналом и разблокирует
            созревшие начисления.
          </small>
        </span>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void reconcile()}
        >
          Сверить
        </button>
      </div>
      {reconciliation && (
        <p className="platform-message">
          Баланс: {reconciliation.balance.amount} ⭐ · Операций:{" "}
          {reconciliation.remoteCount} · Не сопоставлено:{" "}
          {reconciliation.unknownIncoming}
        </p>
      )}
      <h3>Заявки на выплату</h3>
      <div className="platform-tenants">
        {payouts.map((payout) => (
          <div key={payout.id}>
            <span>
              <b>
                {payout.organization.name} · {payout.amountStars} ⭐
              </b>
              <small>
                {payout.status} ·{" "}
                {payout.settlementTonNano
                  ? actualTon(payout.settlementTonNano)
                  : `оценка ${estimatedTon(payout.amountStars, tonRate)}`}
                {payout.tonTransactionHash
                  ? ` · tx ${payout.tonTransactionHash}`
                  : ""}
              </small>
            </span>
            {canEdit && payout.status === "requested" && (
              <button
                onClick={async () => {
                  const suggested = tonRate?.tonPerStar
                    ? (payout.amountStars * tonRate.tonPerStar).toFixed(9)
                    : "";
                  const settlementTon = window.prompt(
                    "Фактическая сумма выплаты в TON:",
                    suggested,
                  );
                  if (!settlementTon) return;
                  try {
                    await request(
                      `/platform/admin/payouts/${payout.id}/review`,
                      "POST",
                      { decision: "approve", settlementTon },
                    );
                    await load();
                  } catch (e: any) {
                    setMessage(e.message);
                  }
                }}
              >
                Согласовать TON
              </button>
            )}
            {canEdit && ["approved", "failed"].includes(payout.status) && (
              <button
                className="primary"
                onClick={async () => {
                  const externalReference = window.prompt(
                    "Hash выполненной TON-транзакции:",
                  );
                  if (!externalReference) return;
                  try {
                    await request(
                      `/platform/admin/payouts/${payout.id}/execute`,
                      "POST",
                      { externalReference },
                    );
                    await load();
                  } catch (e: any) {
                    setMessage(e.message);
                  }
                }}
              >
                Подтвердить TON-выплату
              </button>
            )}
          </div>
        ))}
        {!payouts.length && <p className="muted">Заявок пока нет.</p>}
      </div>
      <h3>Финансовые операции</h3>
      <div className="platform-tenants">
        {ledger.slice(0, 15).map((transaction) => (
          <div key={transaction.id}>
            <span>
              <b>{transaction.type.replaceAll("_", " ")}</b>
              <small>
                {transaction.organization?.name || "Платформа"} ·{" "}
                {new Date(transaction.occurredAt).toLocaleString("ru")} ·{" "}
                {transaction.grossAmount} ⭐ ≈{" "}
                {estimatedTon(transaction.grossAmount, tonRate)}
              </small>
            </span>
            {transaction.type === "stars_publication_paid" &&
              transaction.payment?.status === "paid" && (
                <button
                  className="danger-soft"
                  disabled={busy}
                  onClick={() => void refund(transaction.payment)}
                >
                  Вернуть
                </button>
              )}
          </div>
        ))}
        {!ledger.length && <p className="muted">Операций пока нет.</p>}
      </div>
      <h3 id="platform-communities">Сообщества</h3>
      <div className="platform-tenants">
        {communities.map((community) => (
          <div key={community.id}>
            <span>
              <b>{community.name}</b>
              <small>
                {community.organization?.name} · {community._count.members}{" "}
                участников · {community._count.listings} объявлений
                {community.deletionScheduledFor
                  ? ` · удаление ${new Date(community.deletionScheduledFor).toLocaleDateString("ru")}`
                  : ""}
              </small>
              <small>
                <a
                  href={`https://t.me/${overview.botUsername}?start=moderate_${community.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Модератор ↗
                </a>{" "}
                ·{" "}
                <a
                  href={`https://t.me/${overview.botUsername}?start=community_${community.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Пользователь ↗
                </a>
              </small>
            </span>
            {community.deletionScheduledFor &&
            !community.deletionFinalizedAt ? (
              <button
                className="danger-soft"
                disabled={
                  !canEdit ||
                  new Date(community.deletionScheduledFor) > new Date()
                }
                onClick={() => void finalizeDeletion(community)}
              >
                Финализировать
              </button>
            ) : (
              <button
                disabled={Boolean(community.deletionFinalizedAt)}
                className={
                  community.tenantStatus === "active"
                    ? "danger-soft"
                    : "primary"
                }
                onClick={() => void toggleTenant(community)}
              >
                {community.deletionFinalizedAt
                  ? "Удалено"
                  : community.tenantStatus === "active"
                    ? "Приостановить"
                    : "Включить"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div id="platform-team">
        <PlatformStaffManagement canEdit={canEdit} />
      </div>
      <div id="platform-support">
        <PlatformSupportPanel />
      </div>
    </section>
  );
}

function PlatformLegalManagement({ canEdit }: { canEdit: boolean }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [conversions, setConversions] = useState<any>();
  const [draft, setDraft] = useState({
    type: "terms",
    version: "",
    title: "",
    body: "",
    required: true,
  });
  const [message, setMessage] = useState("");
  const load = () =>
    Promise.all([
      request("/platform/admin/legal-documents"),
      request("/platform/admin/conversions"),
    ]).then(([items, metrics]) => {
      setDocuments(items);
      setConversions(metrics);
    });
  useEffect(() => {
    void load().catch(() => undefined);
  }, []);
  return (
    <section className="platform-legal">
      <h3>Документы и конверсия</h3>
      {conversions && (
        <div className="platform-metrics">
          <div>
            <b>{conversions.uniqueVisitors}</b>
            <span>Посетителей, 30 дней</span>
          </div>
          <div>
            <b>{conversions.events.telegram_cta || 0}</b>
            <span>Переходов в Telegram</span>
          </div>
          <div>
            <b>{conversions.events.pricing_view || 0}</b>
            <span>Просмотров тарифов</span>
          </div>
        </div>
      )}
      <div className="global-audit">
        {documents.slice(0, 6).map((document) => (
          <p key={document.id}>
            <span>
              <b>{document.title}</b>
              <small>
                {document.type} · {document.version} · согласий{" "}
                {document._count.acceptances}
              </small>
            </span>
            <time>{document.required ? "Обязательный" : "Справочный"}</time>
          </p>
        ))}
      </div>
      {canEdit && (
        <details>
          <summary>Опубликовать новую редакцию</summary>
          <form
            className="legal-editor"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage("");
              try {
                await request("/platform/admin/legal-documents", "POST", draft);
                setDraft({
                  type: draft.type,
                  version: "",
                  title: "",
                  body: "",
                  required: draft.required,
                });
                setMessage("✓ Новая редакция опубликована");
                await load();
              } catch (e: any) {
                setMessage(e.message);
              }
            }}
          >
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            >
              <option value="terms">Условия</option>
              <option value="privacy">Конфиденциальность</option>
              <option value="prohibited">Запрещённые товары</option>
            </select>
            <input
              required
              placeholder="Версия, например beta-2"
              value={draft.version}
              onChange={(e) => setDraft({ ...draft, version: e.target.value })}
            />
            <input
              required
              placeholder="Заголовок"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <textarea
              required
              minLength={100}
              rows={12}
              placeholder="Полный текст новой редакции"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) =>
                  setDraft({ ...draft, required: e.target.checked })
                }
              />
              Требовать новое согласие
            </label>
            <button className="primary">
              Опубликовать неизменяемую редакцию
            </button>
          </form>
        </details>
      )}
      {message && <p className="platform-message">{message}</p>}
    </section>
  );
}
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
function Shell({ children }: { children: any }) {
  return <main>{children}</main>;
}
function Message({ text, actions }: { text: string; actions?: any }) {
  return (
    <main className="message">
      <div className="logo">AD</div>
      <h2>{text}</h2>
      <div className="actions">{actions}</div>
    </main>
  );
}
function Skeleton() {
  return (
    <section className="page">
      <div className="skeleton hero" />
      <div className="grid">
        {[1, 2, 3, 4].map((x) => (
          <div className="skeleton card" key={x} />
        ))}
      </div>
    </section>
  );
}
function Catalog() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Listing[]>([]),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(params.get("search") || ""),
    [sort, setSort] = useState(params.get("sort") || "newest"),
    [categories, setCategories] = useState<any[]>([]),
    [community, setCommunity] = useState<CommunityShowcase>(),
    [avatarUrl, setAvatarUrl] = useState(""),
    [loadError, setLoadError] = useState("");
  const categoryId = params.get("categoryId") || "";
  const load = () => {
    setLoading(true);
    setLoadError("");
    request(
      `/listings?search=${encodeURIComponent(params.get("search") || "")}&categoryId=${encodeURIComponent(categoryId)}&sort=${encodeURIComponent(params.get("sort") || "newest")}`,
    )
      .then(setItems)
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [params]);
  useEffect(() => {
    Promise.all([request("/categories"), request("/community/showcase")]).then(
      ([categoryData, communityData]) => {
        setCategories(categoryData);
        setCommunity(communityData);
        if (!localStorage.getItem("adnecta-language")) {
          const rawTelegramLanguage = (() => {
            try {
              const rawUser = new URLSearchParams(
                window.Telegram?.WebApp.initData || "",
              ).get("user");
              return rawUser
                ? String(JSON.parse(rawUser).language_code || "").slice(0, 2)
                : "";
            } catch {
              return "";
            }
          })();
          const automatic = (rawTelegramLanguage || navigator.language || "")
            .slice(0, 2)
            .toLowerCase();
          const supported = supportedLanguages.some(
            ([code]) => code === automatic,
          );
          if (!supported && communityData.defaultLocale)
            void i18n.changeLanguage(communityData.defaultLocale);
        }
      },
    );
  }, []);
  useEffect(() => {
    if (!community?.hasAvatar) return;
    let objectUrl = "";
    apiBlob("/community/avatar")
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [community?.hasAvatar]);
  const applyQuery = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next);
  };
  const toggleFavorite = async (event: any, id: string) => {
    event.stopPropagation();
    try {
      const result = await request(`/listings/${id}/favorite`, "POST");
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, isFavorite: result.favorite } : item,
        ),
      );
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred("success");
    } catch (error: any) {
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred("error");
    }
  };
  return (
    <section className="page">
      <section className="community-hero">
        <header>
          <div className="community-copy">
            <small>{t("communityBoard").toLocaleUpperCase()}</small>
            <h1>{community?.name || "Наше сообщество"}</h1>
          </div>
          <div className="community-avatar" aria-label="Аватар сообщества">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              community?.name?.trim().charAt(0).toUpperCase() || "С"
            )}
          </div>
        </header>
        <p className="community-description">{community?.description}</p>
        {community && (
          <div
            className={`access-note ${community.freeForUser ? "free" : "paid"}`}
          >
            <span>{community.freeForUser ? "✓" : "⭐"}</span>
            <div>
              <b>
                {community.freeForUser
                  ? t("freeForYou")
                  : t("publicationPrice", {
                      count: community.publicationPriceStars,
                    })}
              </b>
              <small>
                {community.isPrivileged
                  ? t("adminFree")
                  : community.freeForUser
                    ? t("activity", {
                        count: community.messageCount,
                        required: community.minMonthlyMessagesForFree,
                        days: community.activityWindowDays,
                      })
                    : t("remaining", { count: community.messagesRemaining })}
              </small>
            </div>
          </div>
        )}
        <button className="hero-add" onClick={() => nav("/add")}>
          ＋ {t("publishListing")}
        </button>
      </section>
      <div className="category-chips" aria-label="Категории">
        <button
          className={!categoryId ? "active" : ""}
          onClick={() => applyQuery({ categoryId: "" })}
        >
          {t("all")}
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={categoryId === category.id ? "active" : ""}
            onClick={() => applyQuery({ categoryId: category.id })}
          >
            <span>{category.icon || "◻"}</span>{" "}
            {localizedCategory(category.name, i18n.resolvedLanguage)}
          </button>
        ))}
      </div>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          applyQuery({ search });
        }}
      >
        <span>⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              setSearch("");
              applyQuery({ search: "" });
            }}
          >
            ×
          </button>
        )}
      </form>
      <div className="catalog-heading">
        <div>
          <small>
            {String(
              categoryId ? t("selectedCategory") : t("freshListings"),
            ).toLocaleUpperCase()}
          </small>
          <h2>
            {loading ? t("loading") : t("listings", { count: items.length })}
          </h2>
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            applyQuery({ sort: e.target.value });
          }}
          aria-label="Сортировка"
        >
          <option value="newest">{t("sortNewest")}</option>
          <option value="popular">{t("sortPopular")}</option>
          <option value="price_asc">{t("sortPriceAsc")}</option>
          <option value="price_desc">{t("sortPriceDesc")}</option>
        </select>
      </div>
      {loadError && <LoadError message={loadError} />}
      {loading ? (
        <Skeleton />
      ) : items.length ? (
        <div className="grid">
          {items.map((item) => (
            <article
              className="listing"
              key={item.id}
              onClick={() => nav(`/listings/${item.id}`)}
            >
              <div
                className="photo"
                style={{ backgroundImage: `url(${item.images[0]?.url || ""})` }}
              >
                {!item.images[0]?.url && (
                  <span className="photo-placeholder">
                    {item.category?.icon || "📦"}
                  </span>
                )}
                {Boolean(item.imageCount) && (
                  <span className="photo-count">📷 {item.imageCount}</span>
                )}
                <button
                  aria-label="Добавить в избранное"
                  className={item.isFavorite ? "favorite active" : "favorite"}
                  onClick={(event) => void toggleFavorite(event, item.id)}
                >
                  {item.isFavorite ? "♥" : "♡"}
                </button>
              </div>
              <small className="listing-category">
                {item.category?.icon}{" "}
                {localizedCategory(item.category?.name, i18n.resolvedLanguage)}
              </small>
              <h3>{item.title}</h3>
              <strong>
                {item.priceType === "free"
                  ? t("free")
                  : item.price
                    ? `${item.price} ${item.currency}`
                    : t("negotiable")}
              </strong>
              <p>
                {item.locationText || t("community")}
                {item.condition !== "not_applicable"
                  ? ` · ${conditionLabel(item.condition, t)}`
                  : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <span>⌕</span>
          <h3>{t("noListings")}</h3>
        </div>
      )}
    </section>
  );
}
function listingCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "объявлений";
  if (last === 1) return "объявление";
  if (last >= 2 && last <= 4) return "объявления";
  return "объявлений";
}
function Categories() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    request("/categories")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="page">
      <h1>{t("categories")}</h1>
      <p className="hint">{t("categoriesHint")}</p>
      {error && <LoadError message={error} />}
      {loading ? (
        <div className="skeleton hero" />
      ) : (
        <div className="category-list">
          {data.map((c) => (
            <button key={c.id} onClick={() => nav(`/?categoryId=${c.id}`)}>
              <span>{c.icon || "◻"}</span>
              {localizedCategory(c.name, i18n.resolvedLanguage)}
              <b>›</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
function conditionLabel(value: string, t?: (key: string) => string) {
  const keys: Record<string, string> = {
    new: "conditionNew",
    like_new: "conditionLikeNew",
    good: "conditionGood",
    fair: "conditionFair",
    for_parts: "conditionParts",
  };
  return t && keys[value] ? t(keys[value]) : value;
}
function ListingDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const [item, setItem] = useState<any>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    request(`/listings/${id}`)
      .then(setItem)
      .catch((e) => setError(e.message));
  }, [id]);
  if (error)
    return (
      <section className="page">
        <button className="back-link" onClick={() => nav(-1)}>
          ← {t("back")}
        </button>
        <LoadError message={error} />
      </section>
    );
  if (!item)
    return (
      <section className="page">
        <Skeleton />
      </section>
    );
  const contact = async () => {
    try {
      const result = await request(`/listings/${id}/contact`, "POST");
      if (result.url) window.location.href = result.url;
      else setMessage(result.message);
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <section className="page listing-detail">
      <button className="back-link" onClick={() => nav(-1)}>
        ← {t("back")}
      </button>
      {item.images?.length > 0 && (
        <div className="detail-images">
          {item.images.map((image: any) => (
            <img key={image.id} src={image.url} alt={item.title} />
          ))}
        </div>
      )}
      <small>
        {item.category?.icon}{" "}
        {localizedCategory(item.category?.name, i18n.resolvedLanguage)}
      </small>
      <h1>{item.title}</h1>
      <strong className="detail-price">
        {item.priceType === "free"
          ? t("free")
          : item.price
            ? `${item.price} ${item.currency}`
            : t("negotiable")}
      </strong>
      <p>{item.description}</p>
      <div className="detail-meta">
        <span>📍 {item.locationText || t("notSpecified")}</span>
        {item.condition !== "not_applicable" && (
          <span>◇ {conditionLabel(item.condition, t)}</span>
        )}
        <span>👁 {item.viewCount}</span>
      </div>
      {message && <div className="save-success">{message}</div>}
      <button className="primary contact-button" onClick={() => void contact()}>
        {t("contactAuthor")}
      </button>
    </section>
  );
}
function Create() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [query] = useSearchParams();
  const editingId = query.get("listingId");
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const [data, setData] = useState<any>(() => {
    if (new URLSearchParams(window.location.search).get("listingId")) return {};
    try {
      return JSON.parse(localStorage.getItem("draft") || "{}");
    } catch {
      localStorage.removeItem("draft");
      return {};
    }
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  useEffect(() => {
    request("/categories").then(setCategories);
  }, []);
  useEffect(() => {
    if (!editingId) return;
    request(`/listings/${editingId}`)
      .then((listing) => {
        setData({
          listingId: listing.id,
          categoryId: listing.categoryId,
          title: listing.title,
          description: listing.description,
          price: listing.price || "",
          priceType: listing.priceType,
          condition: listing.condition,
          locationText: listing.locationText || "",
          contactMode: listing.contactMode,
          attributes: listing.attributes || {},
        });
        setPhotos(listing.images?.map((image: any) => image.url) || []);
      })
      .catch((error) => setFormError(error.message));
  }, [editingId]);
  useEffect(() => {
    if (data.listingId && photos.length === 0)
      request(`/listings/${data.listingId}`)
        .then((listing) =>
          setPhotos(listing.images?.map((image: any) => image.url) || []),
        )
        .catch(() => undefined);
  }, [data.listingId]);
  useEffect(() => localStorage.setItem("draft", JSON.stringify(data)), [data]);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setFormError("");
    try {
      let listingId = data.listingId;
      if (!listingId) {
        const draft = await request("/listings", "POST", data);
        listingId = draft.id;
        setData({ ...data, listingId });
      }
      const form = new FormData();
      [...files].slice(0, 10).forEach((file) => form.append("images", file));
      const images = await api<any[]>(`/listings/${listingId}/images`, {
        method: "POST",
        body: form,
      });
      setPhotos((current) => [...current, ...images.map((image) => image.url)]);
    } catch (error: any) {
      setFormError(error.message || "Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  };
  const selectedCategory = categories.find(
    (category) => category.id === data.categoryId,
  );
  const fieldSchema = Array.isArray(selectedCategory?.fieldSchema)
    ? selectedCategory.fieldSchema
    : [];
  const conditionEnabled = selectedCategory?.conditionEnabled !== false;
  const requiredAttributesValid = fieldSchema
    .filter((field: any) => field.required)
    .every((field: any) => {
      const value = data.attributes?.[field.key];
      return (
        value !== undefined && value !== null && String(value).trim() !== ""
      );
    });
  const setAttribute = (key: string, value: unknown) =>
    setData({
      ...data,
      attributes: { ...(data.attributes || {}), [key]: value },
    });
  const fields = [
    <div className="category-picker">
      {categories.map((c) => (
        <button
          type="button"
          key={c.id}
          className={data.categoryId === c.id ? "selected" : ""}
          onClick={() =>
            setData({
              ...data,
              categoryId: c.id,
              attributes: {},
              condition:
                c.conditionEnabled === false ? "not_applicable" : "good",
              priceType:
                c.name === "Отдам бесплатно"
                  ? "free"
                  : data.priceType || "fixed",
            })
          }
        >
          <span>{c.icon || "◻"}</span>
          <b>{localizedCategory(c.name, i18n.resolvedLanguage)}</b>
          <i>{data.categoryId === c.id ? "✓" : "›"}</i>
        </button>
      ))}
    </div>,
    <input
      maxLength={80}
      placeholder={t("titlePlaceholder")}
      value={data.title || ""}
      onChange={(e) => setData({ ...data, title: e.target.value })}
    />,
    <div>
      <label className={`upload ${uploading ? "busy" : ""}`}>
        ＋<b>{uploading ? t("uploadProgress") : t("uploadPhotos")}</b>
        <small>{t("imageFormats")}</small>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          disabled={uploading}
          onChange={(e) => void upload(e.target.files)}
        />
      </label>
      {photos.length > 0 && (
        <div className="photo-preview">
          {photos.map((url, index) => (
            <img key={url} src={url} alt={`Фото ${index + 1}`} />
          ))}
        </div>
      )}
    </div>,
    <div className="dynamic-fields">
      {fieldSchema.length > 0 && (
        <>
          {fieldSchema.map((field: any) => (
            <label key={field.key}>
              <span>
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.type === "select" ? (
                <select
                  value={data.attributes?.[field.key] || ""}
                  onChange={(event) =>
                    setAttribute(field.key, event.target.value)
                  }
                >
                  <option value="">{t("choose")}</option>
                  {field.options?.map((option: string) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={Boolean(data.attributes?.[field.key])}
                  onChange={(event) =>
                    setAttribute(field.key, event.target.checked)
                  }
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  min={field.min}
                  max={field.max}
                  placeholder={field.placeholder}
                  value={data.attributes?.[field.key] || ""}
                  onChange={(event) =>
                    setAttribute(field.key, event.target.value)
                  }
                />
              )}
            </label>
          ))}
        </>
      )}
      {conditionEnabled && (
        <label>
          <span>{t("condition")}</span>
          <select
            value={data.condition || "good"}
            onChange={(e) => setData({ ...data, condition: e.target.value })}
          >
            <option value="new">{t("conditionNew")}</option>
            <option value="like_new">{t("conditionLikeNew")}</option>
            <option value="good">{t("conditionGood")}</option>
            <option value="fair">{t("conditionFair")}</option>
            <option value="for_parts">{t("conditionParts")}</option>
          </select>
        </label>
      )}
      {!fieldSchema.length && !conditionEnabled && (
        <p className="hint">{t("noExtraFields")}</p>
      )}
    </div>,
    <textarea
      maxLength={3000}
      placeholder={t("descriptionPlaceholder")}
      value={data.description || ""}
      onChange={(e) => setData({ ...data, description: e.target.value })}
    />,
    <div className="price-fields">
      <select
        value={data.priceType || "fixed"}
        onChange={(e) =>
          setData({
            ...data,
            priceType: e.target.value,
            price: e.target.value === "free" ? "" : data.price,
          })
        }
      >
        <option value="fixed">{t("fixedPrice")}</option>
        <option value="negotiable">{t("negotiablePrice")}</option>
        <option value="free">{t("free")}</option>
        <option value="exchange">{t("exchange")}</option>
        <option value="contact">{t("priceOnRequest")}</option>
      </select>
      {!["free", "exchange", "contact"].includes(data.priceType || "fixed") && (
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder={t("pricePlaceholder")}
          value={data.price || ""}
          onChange={(e) => setData({ ...data, price: e.target.value })}
        />
      )}
    </div>,
    <input
      placeholder={t("locationPlaceholder")}
      value={data.locationText || ""}
      onChange={(e) => setData({ ...data, locationText: e.target.value })}
    />,
    <select
      value={data.contactMode || "telegram"}
      onChange={(e) => setData({ ...data, contactMode: e.target.value })}
    >
      <option value="telegram">{t("contactTelegram")}</option>
      <option value="bot">{t("contactBot")}</option>
    </select>,
    <div className="preview">
      <h2>{data.title}</h2>
      {photos.length > 0 && <img src={photos[0]} alt="Главное фото" />}
      <p>{data.description}</p>
      <strong>{data.price} EUR</strong>
    </div>,
  ];
  const valid = [
    Boolean(data.categoryId),
    Boolean(data.title?.trim()),
    !uploading && photos.length > 0,
    requiredAttributesValid,
    Boolean(data.description?.trim()),
    ["free", "exchange", "contact"].includes(data.priceType) ||
      Boolean(data.price),
    Boolean(data.locationText?.trim()),
    true,
    true,
  ][step];
  const done = async () => {
    setSubmitting(true);
    setFormError("");
    let listing: any;
    try {
      listing = data.listingId
        ? await request(`/listings/${data.listingId}`, "PATCH", data)
        : await request("/listings", "POST", data);
      await request(`/listings/${listing.id}/transition`, "POST", {
        status: "pending",
      });
      localStorage.removeItem("draft");
      nav("/profile");
    } catch (error: any) {
      if (error.code !== "PUBLICATION_PAYMENT_REQUIRED") {
        const fields = error.body?.error?.details?.fields;
        setFormError(
          fields?.length ? `Проверьте: ${fields.join(", ")}` : error.message,
        );
        return;
      }
      const invoice = await request(
        `/listings/${listing.id}/payment-link`,
        "POST",
      );
      const webApp = window.Telegram?.WebApp as any;
      if (!webApp?.openInvoice)
        throw new Error("Откройте оплату через Telegram");
      await new Promise<void>((resolve, reject) =>
        webApp.openInvoice(invoice.invoiceUrl, (status: string) =>
          status === "paid"
            ? resolve()
            : reject(new Error("Оплата не завершена")),
        ),
      );
      await request(`/listings/${listing.id}/transition`, "POST", {
        status: "pending",
      });
      localStorage.removeItem("draft");
      nav("/profile");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="page wizard">
      <small>{t("step", { current: step + 1, total: 9 })}</small>
      <div className="progress">
        <i style={{ width: `${((step + 1) / 9) * 100}%` }} />
      </div>
      <h1>
        {
          [
            t("category"),
            t("title"),
            t("photos"),
            t("attributes"),
            t("description"),
            t("price"),
            t("location"),
            t("contactMethod"),
            t("preview"),
          ][step]
        }
      </h1>
      {formError && <div className="form-error">{formError}</div>}
      {fields[step]}
      <div className="wizard-actions">
        <button
          type="button"
          disabled={!step || uploading}
          onClick={() => setStep(step - 1)}
        >
          {t("back")}
        </button>
        <button
          type="button"
          disabled={!valid || submitting}
          className="primary"
          onClick={() => (step === 8 ? done() : setStep(step + 1))}
        >
          {submitting ? t("sending") : step === 8 ? t("submit") : t("next")}
        </button>
      </div>
    </section>
  );
}
function Favorites() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    request("/my/favorites")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="page">
      <h1>Избранное</h1>
      <p className="hint">
        Сохранённые объявления доступны только внутри этого сообщества.
      </p>
      {error && <LoadError message={error} />}
      {loading ? (
        <div className="skeleton hero" />
      ) : data.length ? (
        <div className="favorite-list">
          {data.map((x) => (
            <NavLink key={x.id} to={`/listings/${x.listing.id}`}>
              <span className="favorite-icon">
                {x.listing.category?.icon || "📌"}
              </span>
              <span>
                <b>{x.listing.title}</b>
                <small>
                  {x.listing.category?.name || "Объявление"}
                  {x.listing.locationText ? ` · ${x.listing.locationText}` : ""}
                </small>
              </span>
              <strong>
                {x.listing.price
                  ? `${x.listing.price} ${x.listing.currency || "EUR"}`
                  : "По договорённости"}
              </strong>
            </NavLink>
          ))}
        </div>
      ) : (
        <div className="empty">
          <span>♡</span>
          <h3>Здесь будут избранные объявления</h3>
          <p>
            Нажмите на сердечко в карточке объявления, чтобы быстро вернуться к
            нему позже.
          </p>
          <NavLink className="primary" to="/">
            Посмотреть объявления
          </NavLink>
        </div>
      )}
    </section>
  );
}
function Profile() {
  const [me, setMe] = useState<any>();
  const [ads, setAds] = useState<any[]>([]);
  const [view, setView] = useState<"listings" | "rules" | "settings">(
    "listings",
  );
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => {
    request("/me")
      .then(setMe)
      .catch((e) => setError(e.message));
    request("/my/listings")
      .then(setAds)
      .catch((e) => setError(e.message));
  }, []);
  const roleLabels: Record<string, string> = {
    member: "Участник",
    moderator: "Модератор",
    admin: "Администратор",
    owner: "Владелец",
  };
  return (
    <section className="page profile-page">
      <div className="profile profile-hero">
        <div className="avatar profile-avatar">
          {me?.user?.firstName?.[0] || "?"}
        </div>
        <div>
          <small>МОЙ ПРОФИЛЬ</small>
          <h1>{me?.user?.firstName || "Загрузка…"}</h1>
          <span className="role-badge">{roleLabels[me?.role] || ""}</span>
        </div>
      </div>
      {error && <LoadError message={error} />}
      <div className="profile-shortcuts">
        <button
          className={view === "listings" ? "active" : ""}
          onClick={() => setView("listings")}
        >
          <b>📦</b>
          <span>Объявления</span>
          <small>Мои публикации</small>
        </button>
        <button
          className={view === "rules" ? "active" : ""}
          onClick={() => setView("rules")}
        >
          <b>📖</b>
          <span>Правила</span>
          <small>Правила сообщества</small>
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => setView("settings")}
        >
          <b>⚙</b>
          <span>Мои настройки</span>
          <small>Связь и уведомления</small>
        </button>
      </div>
      <div className="stats">
        <b>
          {ads.length}
          <small>Объявлений</small>
        </b>
        <b>
          {ads.filter((x) => x.status === "published").length}
          <small>Активных</small>
        </b>
        <b>
          {ads.filter((x) => x.status === "pending").length}
          <small>На проверке</small>
        </b>
      </div>
      {view === "rules" ? (
        <ProfileRules rules={me?.community?.rules} />
      ) : view === "settings" ? (
        <ProfileSettings me={me} setMe={setMe} />
      ) : (
        <ProfileListings
          ads={ads}
          setAds={setAds}
          filter={filter}
          setFilter={setFilter}
        />
      )}
    </section>
  );
}
function ProfileRules({ rules }: { rules?: string }) {
  return (
    <div className="profile-panel rules-panel">
      <div className="panel-title">
        <span>📖</span>
        <div>
          <h2>Правила сообщества</h2>
          <small>Актуальная редакция</small>
        </div>
      </div>
      <div className="rules-text">
        {rules?.trim() ||
          "Администратор пока не опубликовал правила сообщества."}
      </div>
    </div>
  );
}
function ProfileSettings({
  me,
  setMe,
}: {
  me: any;
  setMe: (value: any) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!me) return <div className="skeleton hero" />;
  const toggle = (key: string) => setMe({ ...me, [key]: !me[key] });
  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const updated = await request("/me/settings", "PATCH", {
        notifyListingUpdates: me.notifyListingUpdates,
        notifyBuyerInterest: me.notifyBuyerInterest,
        allowDirectContact: me.allowDirectContact,
      });
      setMe({ ...me, ...updated });
      setMessage("Личные настройки сохранены");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="profile-panel preferences-panel">
      <div className="panel-title">
        <span>⚙</span>
        <div>
          <h2>Мои настройки</h2>
          <small>Как с вами связываться</small>
        </div>
      </div>
      {message && <div className="save-success">{message}</div>}
      {error && <LoadError message={error} />}
      <label className="preference-row">
        <span>
          <b>Статусы объявлений</b>
          <small>Одобрение, отклонение и доработка</small>
        </span>
        <input
          type="checkbox"
          checked={me.notifyListingUpdates}
          onChange={() => toggle("notifyListingUpdates")}
        />
      </label>
      <label className="preference-row">
        <span>
          <b>Интерес к объявлению</b>
          <small>Уведомлять через бота, если нет username</small>
        </span>
        <input
          type="checkbox"
          checked={me.notifyBuyerInterest}
          onChange={() => toggle("notifyBuyerInterest")}
        />
      </label>
      <label className="preference-row">
        <span>
          <b>Прямая связь</b>
          <small>Показывать покупателям кнопку перехода в Telegram</small>
        </span>
        <input
          type="checkbox"
          checked={me.allowDirectContact}
          onChange={() => toggle("allowDirectContact")}
        />
      </label>
      <button
        className="primary preferences-save"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "Сохранение…" : "Сохранить"}
      </button>
    </div>
  );
}
function ProfileListings({
  ads,
  setAds,
  filter,
  setFilter,
}: {
  ads: any[];
  setAds: (value: any[]) => void;
  filter: string;
  setFilter: (value: string) => void;
}) {
  const nav = useNavigate();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const visible =
    filter === "all" ? ads : ads.filter((ad) => ad.status === filter);
  const statusLabels: Record<string, string> = {
    draft: "Черновик",
    pending: "На проверке",
    changes_requested: "Нужна доработка",
    published: "Опубликовано",
    sold: "Продано",
    archived: "В архиве",
    rejected: "Отклонено",
    expired: "Срок истёк",
  };
  const transition = async (ad: any, status: string) => {
    setBusy(ad.id);
    setError("");
    try {
      const updated = await request(`/listings/${ad.id}/transition`, "POST", {
        status,
      });
      setAds(
        ads.map((item) => (item.id === ad.id ? { ...item, ...updated } : item)),
      );
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy("");
    }
  };
  const edit = async (ad: any) => {
    if (
      ["rejected", "expired"].includes(ad.status) &&
      !(await transition(ad, "draft"))
    )
      return;
    nav(`/add?listingId=${ad.id}`);
  };
  const filters = [
    ["all", "Все"],
    ["published", "Активные"],
    ["draft", "Черновики"],
    ["pending", "На проверке"],
    ["changes_requested", "Доработка"],
    ["sold", "Проданные"],
    ["archived", "Архив"],
  ];
  return (
    <div className="profile-listings-section">
      <div className="profile-section-heading">
        <div>
          <h2>Мои объявления</h2>
          <small>Управление публикациями</small>
        </div>
        <NavLink to="/add" className="profile-add">
          + Новое
        </NavLink>
      </div>
      <div className="listing-filters">
        {filters.map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "active" : ""}
            onClick={() => setFilter(key)}
          >
            {label}
            <small>
              {key === "all"
                ? ads.length
                : ads.filter((ad) => ad.status === key).length}
            </small>
          </button>
        ))}
      </div>
      {error && <LoadError message={error} />}
      {visible.length ? (
        visible.map((ad) => (
          <article className="profile-listing-card" key={ad.id}>
            <div
              className="profile-listing-image"
              style={{ backgroundImage: `url(${ad.images?.[0]?.url || ""})` }}
            />
            <div
              className="profile-listing-body"
              onClick={() => nav(`/listings/${ad.id}`)}
            >
              <b>{ad.title || "Без названия"}</b>
              <span className={`status-badge status-${ad.status}`}>
                {statusLabels[ad.status] || ad.status}
              </span>
              {ad.moderationComment && (
                <small className="moderation-reason">
                  {ad.moderationComment}
                </small>
              )}
              <small>
                {ad.updatedAt
                  ? `Обновлено ${new Date(ad.updatedAt).toLocaleDateString("ru")}`
                  : ""}
              </small>
            </div>
            <div className="profile-listing-actions">
              {["draft", "changes_requested", "rejected", "expired"].includes(
                ad.status,
              ) && (
                <button disabled={busy === ad.id} onClick={() => void edit(ad)}>
                  ✎ Изменить
                </button>
              )}
              {ad.status === "published" && (
                <>
                  <button
                    disabled={busy === ad.id}
                    onClick={() => void transition(ad, "sold")}
                  >
                    ✓ Продано
                  </button>
                  <button
                    disabled={busy === ad.id}
                    onClick={() => void transition(ad, "archived")}
                  >
                    В архив
                  </button>
                </>
              )}
              {ad.status === "sold" && (
                <>
                  <button
                    disabled={busy === ad.id}
                    onClick={() => void transition(ad, "published")}
                  >
                    Вернуть
                  </button>
                  <button
                    disabled={busy === ad.id}
                    onClick={() => void transition(ad, "archived")}
                  >
                    В архив
                  </button>
                </>
              )}
            </div>
          </article>
        ))
      ) : (
        <div className="profile-empty">
          <span>📦</span>
          <b>Здесь пока пусто</b>
          <small>Объявления с этим статусом не найдены</small>
        </div>
      )}
    </div>
  );
}
function Admin() {
  const location = useLocation();
  const view = location.pathname.split("/")[2] || "dashboard";
  return (
    <section className="page admin-page">
      <header className="admin-header">
        <div>
          <small>УПРАВЛЕНИЕ СООБЩЕСТВОМ</small>
          <h1>Панель администратора</h1>
        </div>
      </header>
      <div
        className="admin-nav"
        role="navigation"
        aria-label="Разделы администрирования"
      >
        <NavLink end to="/admin">
          🏠<span>Обзор</span>
        </NavLink>
        <NavLink to="/admin/moderation">
          ✓<span>Модерация</span>
        </NavLink>
        <NavLink to="/admin/users">
          👥<span>Люди</span>
        </NavLink>
        <NavLink to="/admin/risk">
          🛡<span>Риски</span>
        </NavLink>
        <NavLink to="/admin/settings">
          ⚙<span>Настройки</span>
        </NavLink>
        <NavLink to="/admin/audit">
          📋<span>Журнал</span>
        </NavLink>
      </div>
      {view === "dashboard" && <AdminDashboard />}
      {view === "moderation" && <AdminModeration />}
      {view === "users" && <AdminUsers />}
      {view === "risk" && <AdminRisk />}
      {view === "settings" && <AdminSettings />}
      {view === "audit" && <AdminAudit />}
    </section>
  );
}
function AdminRisk() {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => request("/admin/abuse").then(setItems);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const resolve = async (id: string, resolution: string) => {
    setBusy(id);
    setError("");
    try {
      await request(`/admin/abuse/${id}/resolve`, "POST", { resolution });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const labels: Record<string, string> = {
    prohibited_content: "Запрещённый контент",
    probable_duplicate: "Вероятный дубликат",
    similar_listing: "Похожее объявление",
    new_account: "Новый аккаунт",
    many_external_links: "Много ссылок",
    low_information: "Мало полезной информации",
    invoice_velocity: "Слишком много счетов",
    risky_listing: "Риск объявления",
  };
  return (
    <div className="admin-view">
      <h2>Риск-контроль</h2>
      <p className="hint">
        Автоматические сигналы не банят пользователя: администратор видит
        причины и принимает решение.
      </p>
      {error && <LoadError message={error} />}{" "}
      {!items.length && !error && (
        <div className="admin-empty">Открытых риск-событий нет</div>
      )}
      {items.map((item) => (
        <article className="risk-card" key={item.id}>
          <header>
            <span>
              <b>
                {item.type === "payment_risk"
                  ? "Проверка оплаты"
                  : "Проверка объявления"}
              </b>
              <small>
                {item.user?.firstName || "Пользователь"} · риск {item.score}/100
              </small>
            </span>
            <strong>{item.severity}</strong>
          </header>
          {item.listing && (
            <div>
              <b>{item.listing.title}</b>
              <p>{item.listing.description}</p>
            </div>
          )}
          <ul>
            {item.reasons.map((reason: string) => (
              <li key={reason}>{labels[reason] || reason}</li>
            ))}
          </ul>
          <footer>
            <button
              disabled={busy === item.id}
              onClick={() => void resolve(item.id, "false_positive")}
            >
              Ложное срабатывание
            </button>
            {item.payment && (
              <button
                className="primary"
                disabled={busy === item.id}
                onClick={() => void resolve(item.id, "approved")}
              >
                Разрешить оплату
              </button>
            )}
            <button
              className="danger-soft"
              disabled={busy === item.id}
              onClick={() => void resolve(item.id, "blocked")}
            >
              Подтвердить риск
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}
function LoadError({ message }: { message: string }) {
  return <div className="form-error">{message}</div>;
}
function AdminDashboard() {
  const [d, setD] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    request("/admin/dashboard")
      .then(setD)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="admin-view">
      <h2>Сводка</h2>
      {error && <LoadError message={error} />}
      <div className="stats">
        <b>
          {d?.pending || 0}
          <small>На проверке</small>
        </b>
        <b>
          {d?.reports || 0}
          <small>Жалоб</small>
        </b>
        <b>
          {d?.publishedWeek || 0}
          <small>За неделю</small>
        </b>
      </div>
      <div className="admin-actions-grid">
        <NavLink to="/admin/moderation">
          <b>{d?.pending || 0}</b>
          <span>Очередь модерации</span>
        </NavLink>
        <NavLink to="/admin/users">
          <b>👥</b>
          <span>Роли и доступ</span>
        </NavLink>
        <NavLink to="/admin/risk">
          <b>{d?.abuseOpen || 0}</b>
          <span>Риск-события</span>
        </NavLink>
        <NavLink to="/admin/settings">
          <b>⚙</b>
          <span>Правила и защита</span>
        </NavLink>
        <NavLink to="/admin/audit">
          <b>📋</b>
          <span>Журнал действий</span>
        </NavLink>
      </div>
    </div>
  );
}
function AdminModeration() {
  const [queue, setQueue] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    request("/admin/moderation")
      .then(setQueue)
      .catch((e) => setError(e.message));
  }, []);
  const action = async (id: string, status: string) => {
    setBusy(id);
    setError("");
    try {
      await request(`/admin/listings/${id}/transition`, "POST", {
        status,
        reason: status === "published" ? undefined : "Решение модератора",
      });
      setQueue((current) => current.filter((item) => item.id !== id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="admin-view">
      <h2>Очередь модерации</h2>
      {error && <LoadError message={error} />}
      {!queue.length && !error && (
        <div className="admin-empty">На проверке нет объявлений</div>
      )}
      {queue.map((x) => (
        <article className="moderate" key={x.id}>
          <h3>{x.title}</h3>
          <small>
            {x.category?.icon} {x.category?.name} · {x.author?.firstName}
          </small>
          {x.riskScore > 0 && (
            <div className="moderation-risk">
              🛡 Риск {x.riskScore}/100 · {(x.riskReasons || []).join(", ")}
            </div>
          )}
          <p>{x.description}</p>
          <div>
            <button
              disabled={busy === x.id}
              onClick={() => action(x.id, "changes_requested")}
            >
              Доработать
            </button>
            <button
              disabled={busy === x.id}
              onClick={() => action(x.id, "rejected")}
            >
              Отклонить
            </button>
            <button
              disabled={busy === x.id}
              className="primary"
              onClick={() => action(x.id, "published")}
            >
              {busy === x.id ? "Обработка…" : "Одобрить"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
function AdminReports() {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => request("/admin/reports").then(setItems);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const resolve = async (item: any, status: "resolved" | "dismissed") => {
    setBusy(item.id);
    setError("");
    try {
      await request(`/admin/reports/${item.id}/resolve`, "POST", {
        status,
        resolution:
          status === "resolved"
            ? "Жалоба рассмотрена администратором"
            : "Нарушение не подтверждено",
      });
      setItems((current) => current.filter((report) => report.id !== item.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="admin-view">
      <h2>Жалобы пользователей</h2>
      <p className="hint">
        Все обращения относятся только к выбранному сообществу. Решение
        записывается в журнал действий.
      </p>
      {error && <LoadError message={error} />}
      {!items.length && !error && (
        <div className="admin-empty">Открытых жалоб нет</div>
      )}
      {items.map((item) => (
        <article className="moderate" key={item.id}>
          <h3>{item.listing?.title || "Объявление удалено"}</h3>
          <small>
            {item.reporter?.firstName || "Пользователь"} · {item.reason}
          </small>
          {item.comment && <p>{item.comment}</p>}
          <div>
            <button
              disabled={busy === item.id}
              onClick={() => void resolve(item, "dismissed")}
            >
              Не подтверждено
            </button>
            <button
              className="primary"
              disabled={busy === item.id}
              onClick={() => void resolve(item, "resolved")}
            >
              Рассмотрено
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
function AdminCategories() {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => request("/admin/categories").then(setItems);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const update = async (item: any, patch: Record<string, unknown>) => {
    setBusy(item.id);
    setError("");
    try {
      const saved = await request(
        `/admin/categories/${item.id}`,
        "PATCH",
        patch,
      );
      setItems((current) =>
        current
          .map((category) =>
            category.id === item.id ? { ...category, ...saved } : category,
          )
          .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="admin-view">
      <h2>Категории и поля объявлений</h2>
      <p className="hint">
        Отключайте ненужные разделы и меняйте порядок. Таксономия полей
        сохраняется отдельно для каждой категории.
      </p>
      {error && <LoadError message={error} />}
      <div className="category-admin-list">
        {items.map((item, index) => (
          <article key={item.id}>
            <span>{item.icon || "▦"}</span>
            <div>
              <b>{item.name}</b>
              <small>
                {Array.isArray(item.fieldSchema) ? item.fieldSchema.length : 0}{" "}
                дополнительных полей
              </small>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={item.isActive}
                disabled={busy === item.id}
                onChange={(event) =>
                  void update(item, { isActive: event.target.checked })
                }
              />
              Показывать
            </label>
            <div className="category-order">
              <button
                aria-label="Поднять категорию"
                disabled={index === 0 || Boolean(busy)}
                onClick={() =>
                  void update(item, {
                    sortOrder: Math.max(0, Number(item.sortOrder) - 10),
                  })
                }
              >
                ↑
              </button>
              <button
                aria-label="Опустить категорию"
                disabled={index === items.length - 1 || Boolean(busy)}
                onClick={() =>
                  void update(item, {
                    sortOrder: Number(item.sortOrder) + 10,
                  })
                }
              >
                ↓
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      request(`/admin/users?search=${encodeURIComponent(search)}&limit=50`)
        .then((result) => {
          setUsers(result.items);
          setTotal(result.total);
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const filtered = users;
  const changeRole = async (member: any, role: string) => {
    setSaved("");
    setError("");
    try {
      await request(`/admin/users/${member.userId}`, "PATCH", { role });
      setUsers((current) =>
        current.map((item) =>
          item.id === member.id ? { ...item, role } : item,
        ),
      );
      setSaved(`Роль ${member.user.firstName} сохранена`);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const changeAccess = async (member: any, status: string) => {
    const reason =
      status === "active"
        ? ""
        : window.prompt("Причина ограничения:") || "Решение администратора";
    try {
      await request(`/admin/users/${member.userId}`, "PATCH", {
        status,
        reason,
      });
      setUsers((current) =>
        current.map((item) =>
          item.id === member.id
            ? { ...item, enforcementStatus: status, enforcementReason: reason }
            : item,
        ),
      );
      setSaved(
        `Доступ ${member.user.firstName} обновлён только для этого сообщества`,
      );
    } catch (e: any) {
      setError(e.message);
    }
  };
  const changeFreeAccess = async (member: any, enabled: boolean) => {
    try {
      await request(`/admin/users/${member.userId}`, "PATCH", {
        freePublicationOverride: enabled,
      });
      setUsers((current) =>
        current.map((item) =>
          item.id === member.id
            ? { ...item, freePublicationOverride: enabled }
            : item,
        ),
      );
      setSaved(
        enabled
          ? `${member.user.firstName} добавлен в бесплатный список`
          : `${member.user.firstName} удалён из бесплатного списка`,
      );
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div className="admin-view">
      <h2>Пользователи и роли</h2>
      <p className="hint">
        Здесь показаны участники, которые хотя бы раз открывали доску.
      </p>
      <input
        className="admin-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по имени, @username или ID"
      />
      {error && <LoadError message={error} />}
      {saved && <div className="save-success">{saved}</div>}
      <div className="admin-user-list">
        {filtered.map((member) => (
          <div className="admin-user compact" key={member.id}>
            <div className="admin-user-avatar">
              {member.user.firstName?.[0] || "?"}
            </div>
            <div className="admin-user-info">
              <b>{member.user.firstName}</b>
              <small>
                @{member.user.username || "без username"} ·{" "}
                {member.user.telegramUserId}
              </small>
              <small
                className={
                  member.user.botStartedAt
                    ? "bot-connected"
                    : "bot-disconnected"
                }
              >
                {member.user.botStartedAt
                  ? "✓ Бот подключён"
                  : "Бот не подключён"}
              </small>
            </div>
            <select
              aria-label={`Роль ${member.user.firstName}`}
              value={member.role}
              onChange={(event) => void changeRole(member, event.target.value)}
            >
              <option value="member">Участник</option>
              <option value="moderator">Модератор</option>
              <option value="admin">Админ</option>
              <option value="owner">Владелец</option>
            </select>
            <select
              aria-label={`Доступ ${member.user.firstName}`}
              value={member.enforcementStatus || "active"}
              onChange={(event) =>
                void changeAccess(member, event.target.value)
              }
            >
              <option value="active">Доступ разрешён</option>
              <option value="restricted">Ограничить</option>
              <option value="banned">Заблокировать в доске</option>
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(member.freePublicationOverride)}
                onChange={(event) =>
                  void changeFreeAccess(member, event.target.checked)
                }
              />
              Бесплатные публикации вручную
            </label>
          </div>
        ))}
      </div>
      <small>
        Найдено: {total}
        {total > users.length ? ` · показаны первые ${users.length}` : ""}
      </small>
    </div>
  );
}
function AdminSettings() {
  const [settings, setSettings] = useState<any>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    request("/admin/settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const result = await request("/admin/settings", "PATCH", {
        description: settings.description,
        rules: settings.rules,
        abuseProtectionMode: settings.abuseProtectionMode,
        minQualifiedMessageChars: settings.minQualifiedMessageChars,
        maxLinksPerQualifiedMessage: settings.maxLinksPerQualifiedMessage,
        maxListingsPerDay: settings.maxListingsPerDay,
        duplicateWindowDays: settings.duplicateWindowDays,
        duplicateSimilarityPercent: settings.duplicateSimilarityPercent,
        riskyListingThreshold: settings.riskyListingThreshold,
        maxPaidInvoicesPerDay: settings.maxPaidInvoicesPerDay,
        prohibitedWords: settings.prohibitedWords,
      });
      setSettings(result);
      setMessage("Настройки сохранены");
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred("success");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="admin-view">
      <h2>Правила и безопасность</h2>
      <p className="hint">
        Здесь администратор управляет правилами и защитой. Цена, комиссия,
        активность и подписка находятся в кабинете владельца.
      </p>
      {error && <LoadError message={error} />}
      {message && <div className="save-success">{message}</div>}
      {settings ? (
        <div className="admin-settings">
          <label>
            <span>Описание доски</span>
            <textarea
              rows={4}
              maxLength={500}
              value={settings.description || ""}
              placeholder="Для кого эта доска и какие объявления здесь размещают"
              onChange={(event) =>
                setSettings({ ...settings, description: event.target.value })
              }
            />
            <small>Показывается на главной и завершает настройку бренда.</small>
          </label>
          <fieldset className="abuse-settings">
            <legend>Защита от злоупотреблений</legend>
            <label>
              <span>Режим</span>
              <select
                value={settings.abuseProtectionMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    abuseProtectionMode: e.target.value,
                  })
                }
              >
                <option value="enforce">Защищать</option>
                <option value="observe">Только наблюдать</option>
                <option value="off">Выключено</option>
              </select>
            </label>
            {[
              [
                "minQualifiedMessageChars",
                "Минимум символов в полезном сообщении",
                1,
                500,
              ],
              [
                "maxLinksPerQualifiedMessage",
                "Максимум ссылок в сообщении",
                0,
                10,
              ],
              [
                "maxListingsPerDay",
                "Объявлений пользователя за 24 часа",
                1,
                100,
              ],
              ["duplicateWindowDays", "Окно поиска дубликатов, дней", 1, 365],
              [
                "duplicateSimilarityPercent",
                "Сходство для дубликата, %",
                50,
                100,
              ],
              [
                "riskyListingThreshold",
                "Порог ручной проверки, баллов",
                1,
                100,
              ],
              ["maxPaidInvoicesPerDay", "Платёжных счетов за 24 часа", 1, 100],
            ].map(([key, label, min, max]) => (
              <label key={String(key)}>
                <span>{label}</span>
                <input
                  type="number"
                  min={Number(min)}
                  max={Number(max)}
                  value={settings[String(key)]}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      [String(key)]: Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
            <label>
              <span>Запрещённые слова и фразы, по одной в строке</span>
              <textarea
                rows={5}
                value={(settings.prohibitedWords || []).join("\n")}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    prohibitedWords: e.target.value
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .slice(0, 200),
                  })
                }
              />
            </label>
          </fieldset>
          <label className="rules-editor">
            <span>Правила сообщества</span>
            <textarea
              rows={12}
              maxLength={10000}
              value={settings.rules || ""}
              onChange={(event) =>
                setSettings({ ...settings, rules: event.target.value })
              }
            />
            <small>
              Этот текст сразу отображается в разделе «Правила» у всех
              пользователей.
            </small>
          </label>
          <button
            type="button"
            disabled={saving}
            className="primary save-settings"
            onClick={() => void save()}
          >
            {saving ? "Сохранение…" : "Сохранить настройки"}
          </button>
        </div>
      ) : (
        !error && <div className="skeleton hero" />
      )}
    </div>
  );
}
function AdminAudit() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    request("/admin/audit-log")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="admin-view">
      <h2>Журнал действий</h2>
      {error && <LoadError message={error} />}
      {items.map((item) => (
        <div className="audit-row" key={item.id}>
          <b>{item.action}</b>
          <small>
            {item.moderator?.firstName || "Система"} ·{" "}
            {new Date(item.createdAt).toLocaleString("ru")}
          </small>
          {item.reason && <span>{item.reason}</span>}
        </div>
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelect } from "./LanguageSelect";
import {
  completePlatformTwoFactor,
  pollPlatformWebLogin,
  logoutPlatformSession,
  setPlatformToken,
  startPlatformWebLogin,
} from "./api";

type SiteData = {
  platformName: string;
  botUsername: string;
  plans: Array<{
    key: string;
    name: string;
    description: string;
    currency: string;
    unitAmount: number;
    interval: string;
    features: unknown;
  }>;
  documents: Array<{
    id: string;
    type: string;
    version: string;
    title: string;
    body: string;
    effectiveAt: string;
  }>;
  publication: {
    minimumStars: number;
    defaultCommissionPercent: number;
    holdDays: number;
    freeBoardSubscriptionStars: number;
    minimumPayoutStars: number;
  };
};

const visitor = () => {
  const key = "boardVisitor";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID().replaceAll("-", "");
    localStorage.setItem(key, value);
  }
  return value;
};

async function track(event: string, path = window.location.pathname) {
  try {
    await fetch("/api/public/conversion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event,
        visitor: visitor(),
        path,
        referrer: document.referrer,
      }),
      keepalive: true,
    });
  } catch {
    /* Analytics must never block the product. */
  }
}

function Header({ botUsername }: { botUsername?: string }) {
  const { t } = useTranslation();
  const [signedIn, setSignedIn] = useState(
    Boolean(sessionStorage.getItem("platformToken")),
  );
  useEffect(() => {
    fetch("/api/platform/me")
      .then((response) => setSignedIn(response.ok))
      .catch(() => undefined);
  }, []);
  return (
    <header className="public-header">
      <a className="public-brand" href="/">
        <span>AD</span>
        <b>Adnecta</b>
      </a>
      <nav>
        <a href="/pricing">{t("pricingNav")}</a>
        <a href="/docs">{t("howItWorks")}</a>
        <a href="/support">{t("support")}</a>
      </nav>
      <LanguageSelect compact />
      <a
        className="public-login"
        href={signedIn ? "/owner" : "/login"}
        onClick={() =>
          void track(signedIn ? "dashboard_return" : "web_login_open")
        }
      >
        {signedIn ? t("openAdminDashboard") : t("telegramLogin")}
      </a>
    </header>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="public-footer">
      <div>
        <b>Adnecta 2.0</b>
        <span>Marketplace for every community.</span>
      </div>
      <nav>
        <a href="/terms">{t("terms")}</a>
        <a href="/privacy">{t("privacy")}</a>
        <a href="/prohibited">{t("prohibited")}</a>
        <a href="/support">{t("support")}</a>
      </nav>
      <small>
        {t("betaStars")}{" "}
        <a
          className="service-owner-entry"
          href="/platform-login"
          aria-label={t("platformOwnerDashboard")}
        >
          ·
        </a>
      </small>
    </footer>
  );
}

function TelegramCta({ data, label }: { data: SiteData; label?: string }) {
  const { t } = useTranslation();
  return (
    <a
      className="public-primary"
      href="/login"
      onClick={() => void track("web_signup_start")}
    >
      {label || t("connectCommunity")}
      <span>→</span>
    </a>
  );
}

function Landing({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  return (
    <>
      {/* ── HERO ── */}
      <section className="public-hero">
        <div className="beta-pill">{t("landingBadge")}</div>
        <h1>
          {t("landingTitle")}
          <br />
          <em>{t("landingAccent")}</em>
        </h1>
        <p>{t("landingLead")}</p>
        <div className="hero-actions">
          <TelegramCta data={data} />
          <a href="/docs" className="hero-secondary">{t("viewProcess")}</a>
        </div>
        <div className="trust-row">
          <span>✓ {t("trustBot")}</span>
          <span>✓ {t("starsOnlyNote")}</span>
          <span>✓ {t("trustDashboard")}</span>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="public-how">
        <div className="how-header">
          <small>{t("quickLaunch")}</small>
          <h2>{t("howItWorksTitle")}</h2>
        </div>
        <div className="how-grid">
          <article>
            <span>01</span>
            <h3>{t("selfConnect")}</h3>
            <p>{t("selfConnectText")}</p>
          </article>
          <article>
            <span>02</span>
            <h3>{t("smartPublishing")}</h3>
            <p>{t("smartPublishingText")}</p>
          </article>
          <article>
            <span>03</span>
            <h3>{t("communityEconomy")}</h3>
            <p>{t("communityEconomyText")}</p>
          </article>
        </div>
      </section>

      {/* ── DEMO ── */}
      <section className="public-demo">
        <div className="demo-board">
          <header>
            <span>IT Tarragona</span>
            <small>{t("communityBoard")}</small>
          </header>
          <article>
            <i>🚲</i>
            <div>
              <b>City bicycle</b>
              <small>Vehicles · Tarragona</small>
              <strong>180 €</strong>
            </div>
          </article>
          <article>
            <i>💻</i>
            <div>
              <b>Frontend developer</b>
              <small>Jobs · Remote</small>
              <strong>{t("negotiable")}</strong>
            </div>
          </article>
          <article>
            <i>🏠</i>
            <div>
              <b>2BR apartment for rent</b>
              <small>Property · Barcelona</small>
              <strong>1 200 €/mo</strong>
            </div>
          </article>
        </div>
        <aside>
          <small>{t("insideGroup")}</small>
          <h2>{t("notEmptyMarketplace")}</h2>
          <p>{t("communityValue")}</p>
          <TelegramCta data={data} />
        </aside>
      </section>

      {/* ── FEATURES ── */}
      <section className="public-features">
        <small>{t("onePlatform")}</small>
        <h2>{t("everythingLocal")}</h2>
        <div className="features-grid">
          <article>
            <span>01</span>
            <h3>{t("selfConnect")}</h3>
            <p>{t("selfConnectText")}</p>
          </article>
          <article>
            <span>02</span>
            <h3>{t("smartPublishing")}</h3>
            <p>{t("smartPublishingText")}</p>
          </article>
          <article>
            <span>03</span>
            <h3>{t("communityEconomy")}</h3>
            <p>{t("communityEconomyText")}</p>
          </article>
          <article>
            <span>04</span>
            <h3>{t("communityAdministrator")}</h3>
            <p>{t("communityAdministratorText")}</p>
          </article>
        </div>
      </section>

      {/* ── ROLES ── */}
      <section className="public-roles">
        <small>{t("clearRoles")}</small>
        <h2>{t("roleInterfaces")}</h2>
        <div className="roles-grid">
          <article>
            <b>{t("communityAdministrator")}</b>
            <p>{t("communityAdministratorText")}</p>
          </article>
          <article>
            <b>{t("moderator")}</b>
            <p>{t("moderatorText")}</p>
          </article>
          <article>
            <b>{t("member")}</b>
            <p>{t("memberText")}</p>
          </article>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="public-pricing-inline">
        <small>{t("transparentRules")}</small>
        <h2>{t("priceAndActivity")}</h2>
        <p className="pricing-lead">{t("economyLead", { count: data.publication.minimumStars })}</p>
        <div className="pricing-models">
          <article>
            <small>{t("model1Label")}</small>
            <h3>{t("model1Title")}</h3>
            <strong className="pricing-price">
              15%<i>{" "}{t("model1Feature1").split(" ")[0] === "85%" ? "commission" : "platform fee"}</i>
            </strong>
            <p>{t("model1Desc", { count: data.publication.minimumStars })}</p>
            <ul>
              <li>✓ {t("model1Feature1")}</li>
              <li>✓ {t("model1Feature2")}</li>
              <li>✓ {t("model1Feature3")}</li>
            </ul>
          </article>
          <article className="pricing-alt">
            <small>{t("model2Label")}</small>
            <h3>{t("model2Title")}</h3>
            <strong className="pricing-price">
              {data.publication.freeBoardSubscriptionStars} ⭐<i>/30 days</i>
            </strong>
            <p>{t("model2Desc")}</p>
            <ul>
              <li>✓ {t("model2Feature1")}</li>
              <li>✓ {t("model2Feature2")}</li>
              <li>✓ {t("model2Feature3")}</li>
            </ul>
          </article>
        </div>
        <div className="pricing-note-inline">
          <b>{t("allPaymentsInTelegram")}</b>
          <p>{t("allPaymentsDesc", { hold: data.publication.holdDays, min: data.publication.minimumPayoutStars })}</p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="public-faq">
        <small>{t("faq")}</small>
        <h2>{t("transparentLaunch")}</h2>
        <details>
          <summary>{t("ownBotQuestion")}</summary>
          <p>{t("ownBotAnswer")}</p>
        </details>
        <details>
          <summary>{t("freeQuestion")}</summary>
          <p>{t("freeAnswer")}</p>
        </details>
        <details>
          <summary>{t("moderationQuestion")}</summary>
          <p>{t("moderationAnswer")}</p>
        </details>
        <details>
          <summary>{t("disableQuestion")}</summary>
          <p>{t("disableAnswer")}</p>
        </details>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="public-final">
        <h2>{t("launchCommunity")}</h2>
        <p>{t("launchLead")}</p>
        <TelegramCta data={data} label={t("createAdminDashboard")} />
      </section>
    </>
  );
}

function Pricing({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  useEffect(() => {
    void track("pricing_view");
  }, []);
  return (
    <main className="public-page">
      <small>{t("pricingPageBadge")}</small>
      <h1>{t("pricingPageTitle")}</h1>
      <p className="lead">{t("pricingPageLead")}</p>
      <div className="pricing-grid">
        <article>
          <small>{t("model1Label")}</small>
          <h2>{t("model1Title")}</h2>
          <strong>
            15%<i>{" "}platform fee</i>
          </strong>
          <p>{t("model1Desc", { count: data.publication.minimumStars })}</p>
          <ul>
            <li>✓ {t("model1Feature1")}</li>
            <li>✓ {t("model1Feature2")}</li>
            <li>✓ {t("model1Feature3")}</li>
          </ul>
        </article>
        <article>
          <small>{t("model2Label")}</small>
          <h2>{t("model2Title")}</h2>
          <strong>
            {data.publication.freeBoardSubscriptionStars} ⭐<i>/ 30 days</i>
          </strong>
          <p>{t("model2Desc")}</p>
          <ul>
            <li>✓ {t("model2Feature1")}</li>
            <li>✓ {t("model2Feature2")}</li>
            <li>✓ {t("model2Feature3")}</li>
          </ul>
        </article>
      </div>
      <div className="pricing-note">
        <b>{t("allPaymentsInTelegram")}</b>
        <p>{t("allPaymentsDesc", { hold: data.publication.holdDays, min: data.publication.minimumPayoutStars })}</p>
      </div>
      <TelegramCta data={data} />
    </main>
  );
}

function Docs({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  useEffect(() => {
    void track("docs_view");
  }, []);
  return (
    <main className="public-page">
      <small>{t("docsPageBadge")}</small>
      <h1>{t("docsPageTitle")}</h1>
      <p className="lead">{t("docsPageLead")}</p>
      <div className="steps">
        <article>
          <b>1</b>
          <div>
            <h2>{t("docsStep1Title")}</h2>
            <p>{t("docsStep1Text")}</p>
          </div>
        </article>
        <article>
          <b>2</b>
          <div>
            <h2>{t("docsStep2Title")}</h2>
            <p>{t("docsStep2Text")}</p>
          </div>
        </article>
        <article>
          <b>3</b>
          <div>
            <h2>{t("docsStep3Title")}</h2>
            <p>{t("docsStep3Text")}</p>
          </div>
        </article>
        <article>
          <b>4</b>
          <div>
            <h2>{t("docsStep4Title")}</h2>
            <p>{t("docsStep4Text")}</p>
          </div>
        </article>
        <article>
          <b>5</b>
          <div>
            <h2>{t("docsStep5Title")}</h2>
            <p>{t("docsStep5Text", { stars: data.publication.freeBoardSubscriptionStars })}</p>
          </div>
        </article>
        <article>
          <b>6</b>
          <div>
            <h2>{t("docsStep6Title")}</h2>
            <p>{t("docsStep6Text")}</p>
          </div>
        </article>
      </div>
      <h2>{t("commissionAndPayouts")}</h2>
      <p>{t("commissionAndPayoutsDesc", { hold: data.publication.holdDays, min: data.publication.minimumPayoutStars })}</p>
      <TelegramCta data={data} label={t("startRegistration")} />
    </main>
  );
}

function WebLogin({ platformOwner = false }: { platformOwner?: boolean }) {
  const { t } = useTranslation();
  const tokenPathPrefix = platformOwner ? "/platform-login/" : "/login/";
  const pathToken = window.location.pathname.startsWith(tokenPathPrefix)
    ? window.location.pathname.slice(tokenPathPrefix.length).split("/")[0]
    : "";
  const urlToken =
    pathToken ||
    new URLSearchParams(window.location.search).get("token") ||
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  const savedIntent = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("platformWebLoginIntent") || "null",
      );
    } catch {
      return null;
    }
  })();
  const initialIntent = urlToken
    ? { ...savedIntent, token: urlToken }
    : savedIntent;
  const nextPath =
    platformOwner || initialIntent?.nextPath === "/platform-owner"
      ? "/platform-owner"
      : "/owner";
  const [intent, setIntent] = useState<any>(initialIntent);
  const [state, setState] = useState<
    "intro" | "waiting" | "two_factor" | "error"
  >(initialIntent ? "waiting" : "intro");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionIsolated, setSessionIsolated] = useState(platformOwner);
  useEffect(() => {
    if (platformOwner) return;
    // The same physical browser can be used with several Telegram accounts.
    // Remove a previous service-owner cookie before exchanging a community
    // owner login so identities and privileges can never bleed between flows.
    void logoutPlatformSession().finally(() => setSessionIsolated(true));
  }, [platformOwner]);
  useEffect(() => {
    if (!urlToken) return;
    window.history.replaceState(
      {},
      "",
      platformOwner ? "/platform-login" : "/login",
    );
  }, []);
  useEffect(() => {
    if (!sessionIsolated || !intent || state !== "waiting") return;
    let active = true;
    const poll = async () => {
      try {
        const result = await pollPlatformWebLogin(intent.token);
        if (!active || result.status === "pending") return;
        if (result.requiresTwoFactor) {
          setChallenge(result.challengeToken);
          setState("two_factor");
          return;
        }
        setPlatformToken(result.accessToken);
        localStorage.removeItem("platformWebLoginIntent");
        if (window.location.hash || window.location.search)
          window.history.replaceState(
            {},
            "",
            platformOwner ? "/platform-login" : "/login",
          );
        void track("web_login_complete");
        window.location.assign(nextPath);
      } catch (e: any) {
        if (!active) return;
        setError(e.message);
        setState("error");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intent, state, nextPath, sessionIsolated]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const nextIntent = await startPlatformWebLogin(
        platformOwner ? "platform_owner" : "owner",
      );
      const storedIntent = { ...nextIntent, nextPath };
      localStorage.setItem(
        "platformWebLoginIntent",
        JSON.stringify(storedIntent),
      );
      setIntent(storedIntent);
      setState("waiting");
      void track("web_login_started");
      // Keep the registration page in this tab. Opening an intermediate blank
      // window leaves users on a white page when they return from Telegram.
      window.location.href = nextIntent.telegramAppUrl || nextIntent.botUrl;
    } catch (e: any) {
      setError(e.message);
      setState("error");
    } finally {
      setBusy(false);
    }
  };
  const finishTwoFactor = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await completePlatformTwoFactor(challenge, code);
      window.location.assign(nextPath);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="web-login">
      <LanguageSelect compact />
      <section>
        <small>
          {platformOwner
            ? String(t("platformOwnerDashboard")).toLocaleUpperCase()
            : String(t("communityAdminDashboard")).toLocaleUpperCase()}
        </small>
        <h1>
          {state === "two_factor"
            ? "Confirm security code"
            : platformOwner
              ? t("platformOwnerDashboard")
              : t("communityAdminDashboard")}
        </h1>
        {state === "intro" && (
          <>
            <p>
              {platformOwner
                ? "Это отдельный браузерный вход для управления всей платформой Adnecta. Личность и право доступа подтверждает ваш Telegram-аккаунт."
                : "Telegram подтвердит вашу личность. Мы не просим номер телефона, пароль или токен собственного бота."}
            </p>
            <ol>
              <li>
                Нажмите кнопку — откроется личный чат с <b>@AdnectaBot</b>.
              </li>
              <li>
                Нажмите «Запустить» или подтвердите вход в сообщении бота.
              </li>
              <li>Нажмите кнопку перехода в кабинет в сообщении бота.</li>
            </ol>
            <button
              className="public-primary"
              disabled={busy || !sessionIsolated}
              onClick={() => void start()}
            >
              {!sessionIsolated
                ? "Разделяем сессии…"
                : busy
                  ? "Открываем бота…"
                  : "Подтвердить вход через Telegram"}
              <span>↗</span>
            </button>
          </>
        )}
        {state === "waiting" && (
          <>
            <div className="login-waiting">
              <span>1</span>
              <div>
                <b>
                  {intent.botUsername
                    ? `Личный чат с @${intent.botUsername}`
                    : "Вход подтверждён в Telegram"}
                </b>
                <p>После ответа бота нажмите кнопку перехода в кабинет.</p>
              </div>
            </div>
            {intent.telegramAppUrl && (
              <a className="public-primary" href={intent.telegramAppUrl}>
                Открыть личный чат в Telegram <span>↗</span>
              </a>
            )}
            {intent.botUrl && (
              <a href={intent.botUrl} target="_blank" rel="noreferrer">
                Если приложение не открылось — открыть через t.me
              </a>
            )}
            <div className="login-pulse">
              <i />
              Ожидаем подтверждение…
            </div>
          </>
        )}
        {state === "two_factor" && (
          <form onSubmit={finishTwoFactor}>
            <p>Введите код подтверждения.</p>
            <input
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
              autoComplete="one-time-code"
              placeholder="000000"
              minLength={6}
              maxLength={12}
              required
            />
            <button className="public-primary" disabled={busy}>
              {busy ? "Проверяем…" : "Войти"}
            </button>
          </form>
        )}
        {state === "error" && (
          <>
            <p className="login-error">{error}</p>
            <button
              onClick={() => {
                localStorage.removeItem("platformWebLoginIntent");
                window.history.replaceState(
                  {},
                  "",
                  platformOwner ? "/platform-login" : "/login",
                );
                setState("intro");
                setIntent(undefined);
              }}
            >
              Начать заново
            </button>
          </>
        )}
        <aside>
          <b>
            {platformOwner ? "Доступ владельца платформы" : "После регистрации"}
          </b>
          <span>
            {platformOwner
              ? "Сообщества → Stars → TON → выплаты → аудит"
              : "Сообщество → права бота → правила и цена → запуск"}
          </span>
        </aside>
      </section>
    </main>
  );
}

function Legal({ document }: { document?: SiteData["documents"][number] }) {
  useEffect(() => {
    void track("legal_view");
  }, [document?.type]);
  if (!document)
    return (
      <main className="public-page">
        <h1>Документ готовится</h1>
      </main>
    );
  return (
    <main className="public-page legal-page">
      <small>ВЕРСИЯ {document.version}</small>
      <h1>{document.title}</h1>
      <p className="legal-date">
        Действует с {new Date(document.effectiveAt).toLocaleDateString("ru")}
      </p>
      {document.body
        .split("\n")
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
    </main>
  );
}

function Support({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  return (
    <main className="public-page">
      <small>{t("support").toUpperCase()}</small>
      <h1>{t("supportTitle")}</h1>
      <div className="support-public">
        <article>
          <h2>{t("supportOwnerTitle")}</h2>
          <p>{t("supportOwnerText")}</p>
          <TelegramCta data={data} label={t("supportOwnerCta")} />
        </article>
        <article>
          <h2>{t("supportStarsTitle")}</h2>
          <p>{t("supportStarsText", { command: "/paysupport" })}</p>
          <a href={`https://t.me/${data.botUsername}`}>{t("supportStarsLink")}</a>
        </article>
      </div>
    </main>
  );
}

export function PublicSite() {
  const [data, setData] = useState<SiteData>();
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  useEffect(() => {
    fetch("/api/public/site")
      .then((response) => response.json())
      .then(setData);
    if (path === "/") void track("landing_view");
  }, [path]);
  const legalType = useMemo(() => path.slice(1), [path]);
  if (!data) return <div className="public-loading">Adnecta</div>;
  if (path === "/platform-login" || path.startsWith("/platform-login/"))
    return (
      <div className="public-site service-login">
        <WebLogin platformOwner />
      </div>
    );
  let content = <Landing data={data} />;
  if (path === "/pricing") content = <Pricing data={data} />;
  if (path === "/login" || path.startsWith("/login/")) content = <WebLogin />;
  if (path === "/docs") content = <Docs data={data} />;
  if (path === "/support") content = <Support data={data} />;
  if (["/terms", "/privacy", "/prohibited"].includes(path))
    content = (
      <Legal
        document={data.documents.find((item) => item.type === legalType)}
      />
    );
  return (
    <div className="public-site">
      <Header botUsername={data.botUsername} />
      {content}
      <Footer />
    </div>
  );
}

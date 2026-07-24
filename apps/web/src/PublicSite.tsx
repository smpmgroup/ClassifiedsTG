import { useEffect, useMemo, useState } from "react";
import {
  completePlatformTwoFactor,
  pollPlatformWebLogin,
  setPlatformToken,
  startPlatformWebLogin,
} from "./api";

type SiteData = {
  platformName: string;
  botUsername: string;
  plans: Array<{ key: string; name: string; description: string; currency: string; unitAmount: number; interval: string; features: unknown }>;
  documents: Array<{ id: string; type: string; version: string; title: string; body: string; effectiveAt: string }>;
  publication: { minimumStars: number; defaultCommissionPercent: number; holdDays: number };
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
      body: JSON.stringify({ event, visitor: visitor(), path, referrer: document.referrer }),
      keepalive: true,
    });
  } catch { /* Analytics must never block the product. */ }
}

function Header({ botUsername }: { botUsername?: string }) {
  const signedIn = Boolean(sessionStorage.getItem("platformToken"));
  return <header className="public-header"><a className="public-brand" href="/"><span>CB</span><b>Community Board</b></a><nav><a href="/pricing">Тарифы</a><a href="/docs">Как работает</a><a href="/support">Поддержка</a></nav><a className="public-login" href={signedIn ? "/dashboard" : "/login"} onClick={() => void track(signedIn ? "dashboard_return" : "web_login_open")}>{signedIn ? "Открыть кабинет" : "Войти через Telegram"}</a></header>;
}

function Footer() {
  return <footer className="public-footer"><div><b>Community Board</b><span>Доска объявлений внутри вашего Telegram-сообщества.</span></div><nav><a href="/terms">Условия</a><a href="/privacy">Конфиденциальность</a><a href="/prohibited">Запрещённые товары</a><a href="/support">Поддержка</a></nav><small>Закрытая beta · платежи за публикации внутри Telegram принимаются только в Telegram Stars</small></footer>;
}

function TelegramCta({ data, label = "Подключить сообщество" }: { data: SiteData; label?: string }) {
  return <a className="public-primary" href="/login" onClick={() => void track("web_signup_start")}>{label}<span>→</span></a>;
}

function Landing({ data }: { data: SiteData }) {
  return <>
    <section className="public-hero"><div className="beta-pill">Закрытая beta · для владельцев Telegram-сообществ</div><h1>Своя доска объявлений.<br/><em>Прямо внутри вашей группы.</em></h1><p>Зарегистрируйтесь на сайте через Telegram, добавьте нашего бота в группу и пройдите пошаговую настройку. Участники получают встроенную доску, а вы — отдельный веб-кабинет с правилами, экономикой и выплатами.</p><div className="hero-actions"><TelegramCta data={data}/><a href="/docs">Посмотреть весь процесс</a></div><div className="trust-row"><span>✓ Не нужно создавать своего бота</span><span>✓ Изоляция данных каждого сообщества</span><span>✓ Настройки и финансы в веб-кабинете</span></div></section>
    <section className="public-demo"><div className="demo-board"><header><span>IT Tarragona</span><small>Доска сообщества</small></header><article><i>🚲</i><div><b>Городской велосипед</b><small>Транспорт · Tarragona</small><strong>180 €</strong></div></article><article><i>💻</i><div><b>Frontend-разработчик</b><small>Работа · Удалённо</small><strong>По договорённости</strong></div></article></div><aside><small>РАБОТАЕТ ВНУТРИ ГРУППЫ</small><h2>Не ещё один пустой маркетплейс</h2><p>Объявления принадлежат живому сообществу. Бот проверяет членство и активность, а администратор управляет правилами и публикациями.</p></aside></section>
    <section className="public-features"><small>ОДНА ПЛАТФОРМА</small><h2>Всё для локальной доски объявлений</h2><div><article><span>01</span><h3>Самостоятельное подключение</h3><p>Администратор входит через Telegram, добавляет бота и проходит проверку разрешений.</p></article><article><span>02</span><h3>Умная публикация</h3><p>Поля меняются по категории, изображения оптимизируются, объявления проходят модерацию.</p></article><article><span>03</span><h3>Экономика сообщества</h3><p>Активность даёт бесплатный доступ. Платные публикации делятся между платформой и сообществом.</p></article></div></section>
    <section className="public-economy"><div><small>ПРОЗРАЧНЫЕ ПРАВИЛА</small><h2>Сообщество задаёт цену и порог активности</h2><p>Минимальная цена платформы — {data.publication.minimumStars} ⭐. Каждая оплата, комиссия, возврат, резерв и выплата сохраняются в неизменяемой истории.</p></div><div className="economy-flow"><span>Публикация<strong>Telegram Stars</strong></span><b>→</b><span>Удержание<strong>{data.publication.holdDays} дней по умолчанию</strong></span><b>→</b><span>Доля сообщества<strong>После сверки</strong></span></div></section>
    <section className="public-final"><h2>Запустите доску для своего сообщества</h2><p>Начните на сайте, подтвердите личность в Telegram и следуйте чек-листу закрытого кабинета.</p><TelegramCta data={data} label="Создать кабинет"/></section>
  </>;
}

function Pricing({ data }: { data: SiteData }) {
  useEffect(() => { void track("pricing_view"); }, []);
  return <main className="public-page"><small>ТАРИФЫ</small><h1>Понятная цена для сообщества</h1><p className="lead">SaaS-подписка оплачивается владельцем на сайте через Stripe. Платные публикации пользователей внутри Telegram оплачиваются отдельно и только Telegram Stars.</p><div className="pricing-grid">{data.plans.map((plan) => <article key={plan.key}><small>{plan.key.toUpperCase()}</small><h2>{plan.name}</h2><strong>{(plan.unitAmount / 100).toLocaleString("ru", { style: "currency", currency: plan.currency.toUpperCase() })}<i>/месяц</i></strong><p>{plan.description}</p><ul>{Array.isArray(plan.features) && plan.features.map((feature: any) => <li key={String(feature)}>✓ {String(feature)}</li>)}</ul></article>)}</div><div className="pricing-note"><b>Во время закрытой beta</b><p>Stripe Billing остаётся выключенным до подключения боевых ключей. Тариф не будет списан без явного подтверждения в Stripe Checkout.</p></div><TelegramCta data={data}/></main>;
}

function Docs({ data }: { data: SiteData }) {
  useEffect(() => { void track("docs_view"); }, []);
  return <main className="public-page"><small>ПОШАГОВОЕ ПОДКЛЮЧЕНИЕ</small><h1>От регистрации до доски внутри группы</h1><p className="lead">Собственный Telegram-бот и его токен не нужны. Один защищённый бот платформы обслуживает независимые сообщества и определяет нужную доску по группе.</p><div className="steps"><article><b>1</b><div><h2>Создайте веб-кабинет</h2><p>На странице входа нажмите «Подтвердить в Telegram». Бот подтвердит ваш Telegram ID, а сайт автоматически откроет закрытую часть без отдельного пароля.</p></div></article><article><b>2</b><div><h2>Создайте организацию</h2><p>Укажите название проекта или сообщества. Здесь будут подписка, финансовая история, обращения и одна или несколько досок.</p></div></article><article><b>3</b><div><h2>Добавьте общего бота в группу</h2><p>Кабинет сформирует одноразовую ссылку. Выберите группу, где вы владелец или администратор, и добавьте бота.</p></div></article><article><b>4</b><div><h2>Проверьте разрешения</h2><p>Выдайте права администратора для публикации, проверки участников и модерации. Кабинет покажет, каких разрешений не хватает.</p></div></article><article><b>5</b><div><h2>Настройте экономику и правила</h2><p>Задайте модераторов, текст правил, категории, порог сообщений для бесплатной публикации и цену платного объявления в Stars.</p></div></article><article><b>6</b><div><h2>Закрепите доску в сообществе</h2><p>Опубликуйте или закрепите кнопку бота. Участники открывают Mini App прямо из Telegram; объявления и модерация остаются только внутри этой группы.</p></div></article></div><h2>Подписка, Stars и выплаты</h2><p>Веб-кабинет показывает SaaS-подписку, ledger платных публикаций, комиссию платформы, резерв и доступную сумму выплаты. Публикации внутри Telegram оплачиваются Stars; подписка владельца сервиса — через Stripe после его подключения.</p><TelegramCta data={data} label="Начать регистрацию"/></main>;
}

function WebLogin() {
  const [intent, setIntent] = useState<any>();
  const [state, setState] = useState<"intro" | "waiting" | "two_factor" | "error">("intro");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!intent || state !== "waiting") return;
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
        void track("web_login_complete");
        window.location.assign("/dashboard");
      } catch (e: any) {
        if (!active) return;
        setError(e.message);
        setState("error");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [intent, state]);
  const start = async () => {
    setBusy(true); setError("");
    try { setIntent(await startPlatformWebLogin()); setState("waiting"); void track("web_login_started"); }
    catch (e: any) { setError(e.message); setState("error"); }
    finally { setBusy(false); }
  };
  const finishTwoFactor = async (event: any) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await completePlatformTwoFactor(challenge, code); window.location.assign("/dashboard"); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <main className="web-login"><section><small>ЗАКРЫТЫЙ КАБИНЕТ</small><h1>{state === "two_factor" ? "Подтвердите второй фактор" : "Вход и регистрация через Telegram"}</h1>{state === "intro" && <><p>Telegram подтвердит вашу личность. Мы не просим номер телефона, пароль или токен собственного бота.</p><ol><li>Нажмите кнопку ниже.</li><li>Подтвердите вход в личном чате с ботом.</li><li>Вернитесь на эту вкладку — кабинет откроется автоматически.</li></ol><button className="public-primary" disabled={busy} onClick={() => void start()}>{busy ? "Создаём вход…" : "Начать регистрацию"}<span>→</span></button></>}{state === "waiting" && <><div className="login-waiting"><span>1</span><div><b>Подтвердите вход в Telegram</b><p>Ссылка действует 10 минут. После подтверждения вернитесь сюда.</p></div></div><a className="public-primary" href={intent.botUrl} target="_blank" rel="noreferrer">Открыть Telegram <span>↗</span></a><div className="login-pulse"><i/>Ожидаем подтверждение…</div></>}{state === "two_factor" && <form onSubmit={finishTwoFactor}><p>Для служебной роли требуется код приложения-аутентификатора или recovery-код.</p><input autoFocus value={code} onChange={(event) => setCode(event.target.value.trim())} autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={12} required/><button className="public-primary" disabled={busy}>{busy ? "Проверяем…" : "Войти"}</button></form>}{state === "error" && <><p className="login-error">{error}</p><button onClick={() => { setState("intro"); setIntent(undefined); }}>Начать заново</button></>}<aside><b>После регистрации</b><span>Организация → группа → права бота → правила и цена → запуск</span></aside></section></main>;
}

function Legal({ document }: { document?: SiteData["documents"][number] }) {
  useEffect(() => { void track("legal_view"); }, [document?.type]);
  if (!document) return <main className="public-page"><h1>Документ готовится</h1></main>;
  return <main className="public-page legal-page"><small>ВЕРСИЯ {document.version}</small><h1>{document.title}</h1><p className="legal-date">Действует с {new Date(document.effectiveAt).toLocaleDateString("ru")}</p>{document.body.split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</main>;
}

function Support({ data }: { data: SiteData }) {
  return <main className="public-page"><small>ПОДДЕРЖКА</small><h1>Мы поможем разобраться</h1><div className="support-public"><article><h2>Владельцам сообществ</h2><p>Откройте кабинет через бота и создайте обращение: там сохраняется история и статус ответа.</p><TelegramCta data={data} label="Открыть кабинет"/></article><article><h2>Оплата Telegram Stars</h2><p>Отправьте боту команду <code>/paysupport</code>. Укажите дату, сумму и название объявления. Никому не передавайте коды или пароль.</p><a href={`https://t.me/${data.botUsername}`}>Написать боту →</a></article></div></main>;
}

export function PublicSite() {
  const [data, setData] = useState<SiteData>();
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  useEffect(() => { fetch("/api/public/site").then((response) => response.json()).then(setData); if (path === "/") void track("landing_view"); }, [path]);
  const legalType = useMemo(() => path.slice(1), [path]);
  if (!data) return <div className="public-loading">Community Board</div>;
  let content = <Landing data={data}/>;
  if (path === "/pricing") content = <Pricing data={data}/>;
  if (path === "/login") content = <WebLogin/>;
  if (path === "/docs") content = <Docs data={data}/>;
  if (path === "/support") content = <Support data={data}/>;
  if (["/terms", "/privacy", "/prohibited"].includes(path)) content = <Legal document={data.documents.find((item) => item.type === legalType)}/>;
  return <div className="public-site"><Header botUsername={data.botUsername}/>{content}<Footer/></div>;
}

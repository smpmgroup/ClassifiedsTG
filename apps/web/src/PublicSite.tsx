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
  publication: { minimumStars: number; defaultCommissionPercent: number; holdDays: number; freeBoardSubscriptionStars: number; minimumPayoutStars: number };
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
  return <footer className="public-footer"><div><b>Community Board</b><span>Доска объявлений внутри вашего Telegram-сообщества.</span></div><nav><a href="/terms">Условия</a><a href="/privacy">Конфиденциальность</a><a href="/prohibited">Запрещённые товары</a><a href="/support">Поддержка</a></nav><small>Закрытая beta · все цифровые услуги и подписки оплачиваются только Telegram Stars</small></footer>;
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
  return <main className="public-page"><small>ТАРИФЫ В TELEGRAM STARS</small><h1>Платформа зарабатывает вместе с сообществом</h1><p className="lead">Банковская карта и Stripe не нужны. Владелец выбирает одну из двух прозрачных моделей прямо в кабинете.</p><div className="pricing-grid"><article><small>МОНЕТИЗАЦИЯ</small><h2>Платные публикации</h2><strong>15%<i>комиссия платформы</i></strong><p>Владелец назначает цену от {data.publication.minimumStars} Stars. Можно брать оплату со всех либо оставить бесплатное размещение активным участникам.</p><ul><li>✓ 85% начисляется сообществу</li><li>✓ Настраиваемый порог активности</li><li>✓ Ручной бесплатный доступ</li></ul></article><article><small>БЕСПЛАТНО ДЛЯ ЛЮДЕЙ</small><h2>Подписка владельца</h2><strong>{data.publication.freeBoardSubscriptionStars} ⭐<i>/ 30 дней</i></strong><p>Если абсолютно все объявления бесплатны, владелец оплачивает работу сервиса ежемесячной подпиской Stars.</p><ul><li>✓ Автоматическое продление Telegram</li><li>✓ Никакой комиссии с объявлений</li><li>✓ Отмена через Telegram</li></ul></article></div><div className="pricing-note"><b>Все расчёты внутри Telegram</b><p>Оплата цифровых функций проводится исключительно в Telegram Stars. Начисления выдерживают {data.publication.holdDays} день, после чего доступны к выплате от {data.publication.minimumPayoutStars} Stars.</p></div><TelegramCta data={data}/></main>;
}

function Docs({ data }: { data: SiteData }) {
  useEffect(() => { void track("docs_view"); }, []);
  return <main className="public-page"><small>ПОШАГОВОЕ ПОДКЛЮЧЕНИЕ</small><h1>От регистрации до доски внутри группы</h1><p className="lead">Собственный Telegram-бот и его токен не нужны. Один защищённый бот платформы обслуживает независимые сообщества и определяет нужную доску по группе.</p><div className="steps"><article><b>1</b><div><h2>Создайте кабинет владельца</h2><p>Подтвердите Telegram ID через бота. В кабинете владельца находятся подключение групп, коммерческая модель, Stars и выплаты.</p></div></article><article><b>2</b><div><h2>Создайте организацию</h2><p>Укажите название проекта или сообщества. Здесь будут финансовая история, обращения и одна или несколько досок.</p></div></article><article><b>3</b><div><h2>Добавьте общего бота в группу</h2><p>Кабинет сформирует одноразовую ссылку. Выберите группу, где вы владелец или администратор, и добавьте бота.</p></div></article><article><b>4</b><div><h2>Проверьте разрешения</h2><p>Выдайте права администратора для публикации, проверки участников и модерации. Кабинет покажет, каких разрешений не хватает.</p></div></article><article><b>5</b><div><h2>Выберите модель Stars</h2><p>Установите цену объявления и критерии активности либо оформите подписку {data.publication.freeBoardSubscriptionStars} ⭐/30 дней для полностью бесплатной доски.</p></div></article><article><b>6</b><div><h2>Назначьте администраторов</h2><p>Панель администратора отвечает за модерацию, пользователей, категории и правила; коммерческие настройки остаются только у владельца.</p></div></article></div><h2>Комиссия и выплаты</h2><p>С каждой платной публикации 15% остаётся платформе, 85% начисляется владельцу сообщества. Начисление становится доступным через {data.publication.holdDays} день. Минимальная заявка — {data.publication.minimumPayoutStars} Stars.</p><TelegramCta data={data} label="Начать регистрацию"/></main>;
}

function WebLogin({ platformOwner = false }: { platformOwner?: boolean }) {
  const hashToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  const savedIntent = (() => {
    try {
      return JSON.parse(localStorage.getItem("platformWebLoginIntent") || "null");
    } catch {
      return null;
    }
  })();
  const initialIntent = hashToken ? { ...savedIntent, token: hashToken } : savedIntent;
  const nextPath =
    platformOwner || initialIntent?.nextPath === "/platform-owner"
      ? "/platform-owner"
      : "/owner";
  const [intent, setIntent] = useState<any>(initialIntent);
  const [state, setState] = useState<"intro" | "waiting" | "two_factor" | "error">(initialIntent ? "waiting" : "intro");
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
        localStorage.removeItem("platformWebLoginIntent");
        if (window.location.hash) window.history.replaceState({}, "", "/login");
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
    return () => { active = false; window.clearInterval(timer); };
  }, [intent, state, nextPath]);
  const start = async () => {
    setBusy(true); setError("");
    try {
      const nextIntent = await startPlatformWebLogin(platformOwner ? "platform_owner" : "owner");
      const storedIntent = { ...nextIntent, nextPath };
      localStorage.setItem("platformWebLoginIntent", JSON.stringify(storedIntent));
      setIntent(storedIntent);
      setState("waiting");
      void track("web_login_started");
      // Keep the registration page in this tab. Opening an intermediate blank
      // window leaves users on a white page when they return from Telegram.
      window.location.href = nextIntent.telegramAppUrl || nextIntent.botUrl;
    }
    catch (e: any) { setError(e.message); setState("error"); }
    finally { setBusy(false); }
  };
  const finishTwoFactor = async (event: any) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await completePlatformTwoFactor(challenge, code); window.location.assign(nextPath); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <main className="web-login"><section><small>{platformOwner ? "СЛУЖЕБНЫЙ WEB-КАБИНЕТ" : "КАБИНЕТ ВЛАДЕЛЬЦА СООБЩЕСТВА"}</small><h1>{state === "two_factor" ? "Подтвердите второй фактор" : platformOwner ? "Вход владельца платформы" : "Вход и регистрация через Telegram"}</h1>{state === "intro" && <><p>{platformOwner ? "Это отдельный браузерный вход для управления всей SaaS-платформой. Telegram подтверждает личность, после чего обязательна 2FA." : "Telegram подтвердит вашу личность. Мы не просим номер телефона, пароль или токен собственного бота."}</p><ol><li>Нажмите кнопку — откроется личный чат с <b>@ITTarragonaadsbot</b>.</li><li>Нажмите «Запустить» или подтвердите вход в сообщении бота.</li><li>Вернитесь в браузер — кабинет откроется автоматически.</li></ol><button className="public-primary" disabled={busy} onClick={() => void start()}>{busy ? "Открываем бота…" : "Подтвердить вход через Telegram"}<span>↗</span></button></>}{state === "waiting" && <><div className="login-waiting"><span>1</span><div><b>{intent.botUsername ? `Личный чат с @${intent.botUsername}` : "Вход подтверждён в Telegram"}</b><p>После ответа бота вернитесь на эту страницу.</p></div></div>{intent.telegramAppUrl && <a className="public-primary" href={intent.telegramAppUrl}>Открыть личный чат в Telegram <span>↗</span></a>}{intent.botUrl && <a href={intent.botUrl} target="_blank" rel="noreferrer">Если приложение не открылось — открыть через t.me</a>}<div className="login-pulse"><i/>Ожидаем подтверждение…</div></>}{state === "two_factor" && <form onSubmit={finishTwoFactor}><p>Для служебной роли требуется код приложения-аутентификатора или recovery-код.</p><input autoFocus value={code} onChange={(event) => setCode(event.target.value.trim())} autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={12} required/><button className="public-primary" disabled={busy}>{busy ? "Проверяем…" : "Войти"}</button></form>}{state === "error" && <><p className="login-error">{error}</p><button onClick={() => { localStorage.removeItem("platformWebLoginIntent"); window.history.replaceState({}, "", platformOwner ? "/platform-login" : "/login"); setState("intro"); setIntent(undefined); }}>Начать заново</button></>}<aside><b>{platformOwner ? "Доступ владельца платформы" : "После регистрации"}</b><span>{platformOwner ? "Организации → сообщества → Stars → TON → выплаты → аудит" : "Организация → группа → права бота → правила и цена → запуск"}</span></aside></section></main>;
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
  if (path === "/platform-login") return <WebLogin platformOwner/>;
  let content = <Landing data={data}/>;
  if (path === "/pricing") content = <Pricing data={data}/>;
  if (path === "/login") content = <WebLogin/>;
  if (path === "/docs") content = <Docs data={data}/>;
  if (path === "/support") content = <Support data={data}/>;
  if (["/terms", "/privacy", "/prohibited"].includes(path)) content = <Legal document={data.documents.find((item) => item.type === legalType)}/>;
  return <div className="public-site"><Header botUsername={data.botUsername}/>{content}<Footer/></div>;
}

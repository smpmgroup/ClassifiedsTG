import { useEffect, useMemo, useState } from "react";

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
  const telegram = `https://t.me/${botUsername || "ITTarragonaadsbot"}?start=platform`;
  return <header className="public-header"><a className="public-brand" href="/"><span>CB</span><b>Community Board</b></a><nav><a href="/pricing">Тарифы</a><a href="/docs">Как работает</a><a href="/support">Поддержка</a></nav><a className="public-login" href={telegram} onClick={() => void track("telegram_cta")}>Войти через Telegram</a></header>;
}

function Footer() {
  return <footer className="public-footer"><div><b>Community Board</b><span>Доска объявлений внутри вашего Telegram-сообщества.</span></div><nav><a href="/terms">Условия</a><a href="/privacy">Конфиденциальность</a><a href="/prohibited">Запрещённые товары</a><a href="/support">Поддержка</a></nav><small>Закрытая beta · платежи за публикации внутри Telegram принимаются только в Telegram Stars</small></footer>;
}

function TelegramCta({ data, label = "Подключить сообщество" }: { data: SiteData; label?: string }) {
  return <a className="public-primary" href={`https://t.me/${data.botUsername}?start=platform`} onClick={() => void track("telegram_cta")}>{label}<span>→</span></a>;
}

function Landing({ data }: { data: SiteData }) {
  return <>
    <section className="public-hero"><div className="beta-pill">Закрытая beta · для Telegram-сообществ</div><h1>Своя доска объявлений.<br/><em>Прямо внутри Telegram.</em></h1><p>Подключите общего бота к группе, настройте правила и модераторов. Активные участники публикуют бесплатно, остальные — за Telegram Stars.</p><div className="hero-actions"><TelegramCta data={data}/><a href="/docs">Посмотреть процесс</a></div><div className="trust-row"><span>✓ Один бот — много независимых групп</span><span>✓ Изоляция данных каждого сообщества</span><span>✓ Модерация и прозрачный ledger</span></div></section>
    <section className="public-demo"><div className="demo-board"><header><span>IT Tarragona</span><small>Доска сообщества</small></header><article><i>🚲</i><div><b>Городской велосипед</b><small>Транспорт · Tarragona</small><strong>180 €</strong></div></article><article><i>💻</i><div><b>Frontend-разработчик</b><small>Работа · Удалённо</small><strong>По договорённости</strong></div></article></div><aside><small>РАБОТАЕТ ВНУТРИ ГРУППЫ</small><h2>Не ещё один пустой маркетплейс</h2><p>Объявления принадлежат живому сообществу. Бот проверяет членство и активность, а администратор управляет правилами и публикациями.</p></aside></section>
    <section className="public-features"><small>ОДНА ПЛАТФОРМА</small><h2>Всё для локальной доски объявлений</h2><div><article><span>01</span><h3>Самостоятельное подключение</h3><p>Администратор входит через Telegram, добавляет бота и проходит проверку разрешений.</p></article><article><span>02</span><h3>Умная публикация</h3><p>Поля меняются по категории, изображения оптимизируются, объявления проходят модерацию.</p></article><article><span>03</span><h3>Экономика сообщества</h3><p>Активность даёт бесплатный доступ. Платные публикации делятся между платформой и сообществом.</p></article></div></section>
    <section className="public-economy"><div><small>ПРОЗРАЧНЫЕ ПРАВИЛА</small><h2>Сообщество задаёт цену и порог активности</h2><p>Минимальная цена платформы — {data.publication.minimumStars} ⭐. Каждая оплата, комиссия, возврат, резерв и выплата сохраняются в неизменяемой истории.</p></div><div className="economy-flow"><span>Публикация<strong>Telegram Stars</strong></span><b>→</b><span>Удержание<strong>{data.publication.holdDays} дней по умолчанию</strong></span><b>→</b><span>Доля сообщества<strong>После сверки</strong></span></div></section>
    <section className="public-final"><h2>Запустите доску для своего сообщества</h2><p>На beta подключение проходит через Telegram и занимает несколько минут.</p><TelegramCta data={data} label="Начать в Telegram"/></section>
  </>;
}

function Pricing({ data }: { data: SiteData }) {
  useEffect(() => { void track("pricing_view"); }, []);
  return <main className="public-page"><small>ТАРИФЫ</small><h1>Понятная цена для сообщества</h1><p className="lead">SaaS-подписка оплачивается владельцем на сайте через Stripe. Платные публикации пользователей внутри Telegram оплачиваются отдельно и только Telegram Stars.</p><div className="pricing-grid">{data.plans.map((plan) => <article key={plan.key}><small>{plan.key.toUpperCase()}</small><h2>{plan.name}</h2><strong>{(plan.unitAmount / 100).toLocaleString("ru", { style: "currency", currency: plan.currency.toUpperCase() })}<i>/месяц</i></strong><p>{plan.description}</p><ul>{Array.isArray(plan.features) && plan.features.map((feature: any) => <li key={String(feature)}>✓ {String(feature)}</li>)}</ul></article>)}</div><div className="pricing-note"><b>Во время закрытой beta</b><p>Stripe Billing остаётся выключенным до подключения боевых ключей. Тариф не будет списан без явного подтверждения в Stripe Checkout.</p></div><TelegramCta data={data}/></main>;
}

function Docs({ data }: { data: SiteData }) {
  useEffect(() => { void track("docs_view"); }, []);
  return <main className="public-page"><small>ДОКУМЕНТАЦИЯ</small><h1>От группы до готовой доски</h1><div className="steps"><article><b>1</b><div><h2>Войдите через Telegram</h2><p>Откройте бота и кабинет владельца. Telegram подтверждает личность без отдельного пароля.</p></div></article><article><b>2</b><div><h2>Добавьте бота в группу</h2><p>Выберите свою группу и выдайте разрешения для проверки участников и публикации.</p></div></article><article><b>3</b><div><h2>Настройте сообщество</h2><p>Добавьте модераторов, правила, категории, порог активности и цену в Stars.</p></div></article><article><b>4</b><div><h2>Откройте доску участникам</h2><p>Пользователи запускают Mini App из Telegram; данные каждой группы полностью разделены.</p></div></article></div><h2>Платежи и выплаты</h2><p>Платформа фиксирует комиссию в момент создания счёта. Stars проходят удержание и сверку. Фиатная сумма выплаты владельцу подтверждается отдельно; Stars не создают баланс Stripe автоматически.</p><TelegramCta data={data}/></main>;
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
  if (path === "/docs") content = <Docs data={data}/>;
  if (path === "/support") content = <Support data={data}/>;
  if (["/terms", "/privacy", "/prohibited"].includes(path)) content = <Legal document={data.documents.find((item) => item.type === legalType)}/>;
  return <div className="public-site"><Header botUsername={data.botUsername}/>{content}<Footer/></div>;
}

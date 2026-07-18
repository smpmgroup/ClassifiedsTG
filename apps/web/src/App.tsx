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
import {
  activateSession,
  api,
  apiBlob,
  login,
  platformLogin,
  request,
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
  description: string;
  hasAvatar: boolean;
  minMonthlyMessagesForFree: number;
  publicationPriceStars: number;
  messageCount: number;
  freeForUser: boolean;
  isPrivileged: boolean;
  messagesRemaining: number;
};
export function App() {
  const { t } = useTranslation();
  const platformMode =
    new URLSearchParams(window.location.search).get("mode") === "platform";
  const [state, setState] = useState<
    "loading" | "ready" | "outside" | "denied" | "select" | "error"
  >(activateSession(platformMode ? "platform" : "tenant") ? "ready" : "loading");
  const [invite, setInvite] = useState("");
  const [communityChoices, setCommunityChoices] = useState<any[]>([]);
  const boot = async () => {
    const init =
      window.Telegram?.WebApp.initData ||
      import.meta.env.VITE_TELEGRAM_INIT_DATA;
    if (!init && import.meta.env.PROD) {
      setState("outside");
      return;
    }
    if (!init) {
      setState("ready");
      return;
    }
    try {
      if (platformMode) await platformLogin(init);
      else
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
    void boot();
  }, []);
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
        text="Выберите доску сообщества"
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
  if (state === "error")
    return (
      <Message
        text="Не удалось открыть доску"
        actions={<button onClick={boot}>{t("retry")}</button>}
      />
    );
  if (platformMode) return <PlatformWorkspace />;
  return (
    <Shell>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Catalog />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/add" element={<Create />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin/*" element={<Admin />} />
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

function PlatformWorkspace() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [busy, setBusy] = useState("");
  const load = () =>
    request("/platform/me")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const createOrganization = async (event: any) => {
    event.preventDefault();
    setBusy("organization");
    setError("");
    try {
      await request("/platform/organizations", "POST", {
        name: organizationName,
      });
      setOrganizationName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const connect = async (organizationId: string) => {
    setBusy(organizationId);
    setError("");
    try {
      const intent = await request("/platform/connect-intents", "POST", {
        organizationId,
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
  if (!data)
    return <Message text={error || "Загружаем кабинет…"} />;
  return (
    <main className="platform-workspace">
      <header className="platform-header">
        <div>
          <small>COMMUNITY BOARD SAAS</small>
          <h1>Кабинет владельца</h1>
          <p>
            {data.user.firstName}
            {data.user.username ? ` · @${data.user.username}` : ""}
          </p>
        </div>
        <div className="avatar">
          {data.user.firstName?.charAt(0).toUpperCase() || "U"}
        </div>
      </header>
      <section className="platform-intro">
        <span>🧩</span>
        <div>
          <h2>Подключите Telegram-сообщество</h2>
          <p>
            Бот проверит ваши права администратора и создаст
            отдельную защищённую доску.
          </p>
        </div>
      </section>
      {error && <LoadError message={error} />}
      <div className="organization-list">
        {data.organizations.map((organization: any) => (
          <section className="organization-card" key={organization.id}>
            <div className="organization-title">
              <div>
                <small>ОРГАНИЗАЦИЯ</small>
                <h2>{organization.name}</h2>
              </div>
              <span>{organization.role === "owner" ? "Владелец" : "Админ"}</span>
            </div>
            <div className="connected-boards">
              {organization.communities.map((community: any) => (
                <CommunityOperations
                  key={community.id}
                  community={community}
                  canManage={["owner", "administrator"].includes(organization.role)}
                  canDelete={organization.role === "owner"}
                  onChanged={load}
                />
              ))}
              {!organization.communities.length && (
                <p className="muted">Группы пока не подключены.</p>
              )}
            </div>
            <OrganizationBilling organization={organization} />
            <OrganizationFinance organizationId={organization.id} />
            <OrganizationSupport organization={organization} />
            {organization.role === "owner" && (
              <button
                type="button"
                className="ownership-transfer"
                disabled={busy === `transfer-${organization.id}`}
                onClick={async () => {
                  const telegramUserId = window.prompt(
                    "Telegram ID нового владельца. Он должен сначала открыть бота.",
                  );
                  if (!telegramUserId) return;
                  if (!window.confirm("После передачи вы станете администратором. Продолжить?")) return;
                  setBusy(`transfer-${organization.id}`);
                  setError("");
                  try {
                    await request(`/platform/organizations/${organization.id}/transfer-ownership`, "POST", { telegramUserId });
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
            <button
              className="primary connect-community"
              disabled={busy === organization.id}
              onClick={() => void connect(organization.id)}
            >
              {busy === organization.id
                ? "Создаём ссылку…"
                : "＋ Добавить бота в группу"}
            </button>
          </section>
        ))}
      </div>
      {!data.organizations.length && (
        <form className="create-organization" onSubmit={createOrganization}>
          <h2>Создайте организацию</h2>
          <p>В ней будут храниться ваши сообщества и биллинг.</p>
          <input
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="Название организации"
            required
            minLength={2}
          />
          <button className="primary" disabled={busy === "organization"}>
            {busy === "organization" ? "Создаём…" : "Продолжить"}
          </button>
        </form>
      )}
      {["platform_admin", "platform_owner"].includes(
        data.user.platformRole,
      ) && <PlatformOwnerPanel canEdit={data.user.platformRole === "platform_owner"} />}
      {data.user.platformRole === "support" && <PlatformSupportPanel />}
      {data.user.platformRole === "finance" && <PlatformFinancePanel />}
    </main>
  );
}

function OrganizationBilling({ organization }: { organization: any }) {
  const [billing, setBilling] = useState<any>();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () =>
    request(`/platform/organizations/${organization.id}/billing`).then(setBilling);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [organization.id]);
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
      <button type="button" className="finance-summary" onClick={() => setExpanded((value) => !value)}>
        <span><small>STRIPE BILLING</small><b>{billing?.subscription.status === "active" ? `Тариф ${billing.subscription.planKey || "active"}` : "Без подписки"}</b></span><i>{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="billing-details">
          {error && <LoadError message={error} />}
          {!billing?.configured && <div className="billing-unavailable"><b>Stripe готов к подключению</b><small>Владелец платформы должен добавить API ключи и Price ID.</small></div>}
          {billing?.plans.map((plan: any) => (
            <article className="billing-plan" key={plan.id}>
              <span><b>{plan.name}</b><small>{plan.description}</small><strong>{(plan.unitAmount / 100).toLocaleString("ru", { style: "currency", currency: plan.currency.toUpperCase() })} / {plan.interval === "month" ? "месяц" : plan.interval}</strong></span>
              <ul>{(plan.features || []).map((feature: string) => <li key={feature}>✓ {feature}</li>)}</ul>
              {organization.role === "owner" && <button className="primary" disabled={Boolean(busy) || !plan.available || ["active", "trialing"].includes(billing.subscription.status)} onClick={() => void action(plan.key, `/platform/organizations/${organization.id}/billing/checkout`, { planKey: plan.key })}>{busy === plan.key ? "Открываем…" : "Выбрать"}</button>}
            </article>
          ))}
          {organization.role === "owner" && billing?.subscription.customerReady && <button disabled={Boolean(busy)} onClick={() => void action("portal", `/platform/organizations/${organization.id}/billing/portal`)}>Управлять подпиской в Stripe</button>}
          <div className="connect-status"><b>Выплаты сообществу</b><small>{billing?.connect.payoutsEnabled ? "✓ Stripe Connect готов к выплатам" : billing?.connect.detailsSubmitted ? "Stripe проверяет данные" : "Пройдите защищённую проверку Stripe"}</small>{billing?.connect.requirementsDue?.length > 0 && <small>Нужно заполнить: {billing.connect.requirementsDue.length}</small>}</div>
          {organization.role === "owner" && <button className="primary" disabled={Boolean(busy) || !billing?.configured} onClick={() => void action("connect", `/platform/organizations/${organization.id}/connect/onboarding`)}>{billing?.connect.accountCreated ? "Продолжить проверку Stripe" : "Подключить Stripe Connect"}</button>}
          {billing?.connect.accountCreated && <button disabled={Boolean(busy) || !billing?.configured} onClick={() => void action("refresh", `/platform/organizations/${organization.id}/connect/refresh`)}>Обновить статус</button>}
          {billing?.invoices.length > 0 && <div className="billing-invoices"><b>Счета</b>{billing.invoices.map((invoice: any) => <p key={invoice.id}><span>{new Date(invoice.createdAt).toLocaleDateString("ru")} · {invoice.status}</span><b>{(invoice.amountPaid / 100).toLocaleString("ru", { style: "currency", currency: invoice.currency.toUpperCase() })}</b></p>)}</div>}
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
      const data = await request(`/platform/communities/${community.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
      <button className="community-summary" type="button" onClick={() => setExpanded((value) => !value)}>
        <span>
          <b>{community.name}</b>
          <small className={community.tenantStatus === "active" ? "status-active" : "status-warning"}>
            {community.tenantStatus === "active" ? "● Работает" : community.tenantStatus === "closed" ? "● Отключено" : "● Требует внимания"}
          </small>
        </span>
        <i>{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="community-details">
          <div className="setup-progress"><span><b>Готовность</b><small>{completed} из {setupItems.length} шагов</small></span><strong>{Math.round((completed / setupItems.length) * 100)}%</strong></div>
          <div className="setup-list">
            {setupItems.map(([done, label]) => <span key={String(label)} className={done ? "done" : ""}>{done ? "✓" : "·"} {label}</span>)}
          </div>
          <div className="community-numbers"><span>{community._count?.members || 0}<small>Участников</small></span><span>{community._count?.listings || 0}<small>Объявлений</small></span></div>
          <a className="open-board-link" href={`/?community=${encodeURIComponent(community.slug)}`}>Открыть доску →</a>
          {error && <LoadError message={error} />}
          {community.deletionScheduledFor && (
            <div className="deletion-warning">
              <b>Удаление запланировано</b>
              <small>Данные будут удалены не ранее {new Date(community.deletionScheduledFor).toLocaleDateString("ru")}.</small>
              {canDelete && <button disabled={Boolean(busy)} onClick={() => void run("cancel-delete", `/platform/communities/${community.id}/cancel-deletion`)}>Отменить удаление</button>}
            </div>
          )}
          {canManage && (
            <div className="community-tools">
              <button disabled={Boolean(busy)} onClick={() => void run("check", `/platform/communities/${community.id}/connection-check`)}>{busy === "check" ? "Проверяем…" : "Проверить бота"}</button>
              <button disabled={Boolean(busy)} onClick={() => void exportData()}>{busy === "export" ? "Готовим…" : "Скачать экспорт"}</button>
              {community.tenantStatus === "closed" ? (
                <button className="primary" disabled={Boolean(busy)} onClick={() => void run("reconnect", `/platform/communities/${community.id}/reconnect`)}>Включить снова</button>
              ) : (
                <button className="danger-soft" disabled={Boolean(busy)} onClick={() => {
                  if (window.confirm("Доска перестанет обслуживать группу. Данные сохранятся. Отключить?")) void run("disconnect", `/platform/communities/${community.id}/disconnect`, { confirmation: "DISCONNECT" });
                }}>Отключить доску</button>
              )}
              {canDelete && !community.deletionScheduledFor && (
                <button
                  className="delete-request"
                  disabled={Boolean(busy) || !exported}
                  title={exported ? "" : "Сначала скачайте экспорт"}
                  onClick={() => {
                    const confirmation = window.prompt("Данные будут удалены через 30 дней. Введите DELETE:");
                    if (confirmation === "DELETE") void run("delete", `/platform/communities/${community.id}/request-deletion`, { confirmation, exportAcknowledged: true });
                  }}
                >Запросить удаление</button>
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
  useEffect(() => {
    request(`/platform/organizations/${organizationId}/finance`)
      .then(setFinance)
      .catch(() => undefined);
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
          <div><span>Ожидает разблокировки</span><b>{finance.balances.pending} ⭐</b></div>
          <div><span>Доступно к выплате</span><b>{finance.balances.available} ⭐</b></div>
          <div><span>Выплачено</span><b>{finance.balances.paidOut} ⭐</b></div>
          <h4>Последние операции</h4>
          {finance.transactions.slice(0, 10).map((transaction: any) => (
            <p key={transaction.id}>
              <span>{transaction.community?.name || "Сообщество"}<small>{new Date(transaction.occurredAt).toLocaleDateString("ru")}</small></span>
              <b>+{transaction.payment?.communityShareStars || 0} ⭐</b>
            </p>
          ))}
          {!finance.transactions.length && <p className="muted">Платных публикаций пока нет.</p>}
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
    request(`/platform/organizations/${organization.id}/support`).then(setTickets);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [organization.id]);
  const create = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`/platform/organizations/${organization.id}/support`, "POST", {
        subject,
        message,
        communityId: organization.communities[0]?.id,
      });
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
      await request(`/platform/support/${ticket.id}/messages`, "POST", { message: text });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="organization-support">
      <button type="button" className="finance-summary" onClick={() => setExpanded((value) => !value)}>
        <span><small>ПОДДЕРЖКА</small><b>{tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length} активных</b></span>
        <i>{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="support-details">
          {error && <LoadError message={error} />}
          {tickets.map((ticket) => (
            <article className="support-ticket" key={ticket.id}>
              <header><b>{ticket.subject}</b><small>{ticket.status}</small></header>
              {ticket.messages.map((item: any) => <p key={item.id}><b>{item.author.firstName}</b><span>{item.body}</span><small>{new Date(item.createdAt).toLocaleString("ru")}</small></p>)}
              {!['resolved', 'closed'].includes(ticket.status) && <button disabled={busy} onClick={() => void reply(ticket)}>Ответить</button>}
            </article>
          ))}
          <form className="support-form" onSubmit={create}>
            <b>Новое обращение</b>
            <input value={subject} maxLength={160} minLength={3} required placeholder="Тема" onChange={(event) => setSubject(event.target.value)} />
            <textarea value={message} maxLength={5000} minLength={5} required rows={4} placeholder="Опишите вопрос" onChange={(event) => setMessage(event.target.value)} />
            <button className="primary" disabled={busy}>{busy ? "Отправляем…" : "Отправить"}</button>
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
      await request(`/platform/admin/support/${ticket.id}`, "PATCH", { status, assignToMe: true });
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
      await request(`/platform/support/${ticket.id}/messages`, "POST", { message });
      await update(ticket, "waiting_customer");
    } catch (e: any) {
      setError(e.message);
      setBusy("");
    }
  };
  return (
    <section className="platform-admin platform-support">
      <small>СЕРВИС</small><h2>Обращения клиентов</h2>
      {error && <LoadError message={error} />}
      {tickets.map((ticket) => (
        <article className="staff-ticket" key={ticket.id}>
          <header><span><b>{ticket.subject}</b><small>{ticket.organization.name} · {ticket.priority} · {ticket.status}</small></span></header>
          <div>{ticket.messages.map((item: any) => !item.internal && <p key={item.id}><b>{item.author.firstName}</b><span>{item.body}</span></p>)}</div>
          <footer><button disabled={busy === ticket.id} onClick={() => void update(ticket, "in_progress")}>Взять</button><button disabled={busy === ticket.id} onClick={() => void reply(ticket)}>Ответить</button><button disabled={busy === ticket.id} onClick={() => void update(ticket, "resolved")}>Решено</button></footer>
        </article>
      ))}
      {!tickets.length && !error && <p className="muted">Обращений пока нет.</p>}
    </section>
  );
}

function PlatformFinancePanel() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      request("/platform/admin/ledger?limit=100"),
      request("/platform/admin/stripe-events"),
    ]).then(([ledgerItems, eventItems]) => {
      setLedger(ledgerItems);
      setEvents(eventItems);
    }).catch((e) => setError(e.message));
  }, []);
  return (
    <section className="platform-admin">
      <small>ФИНАНСЫ</small><h2>Финансовый контроль</h2>
      {error && <LoadError message={error} />}
      <h3>Telegram Stars ledger</h3>
      <div className="global-audit">{ledger.map((item) => <p key={item.id}><span><b>{item.type}</b><small>{item.organization?.name || "Платформа"} · {item.status}</small></span><time>{item.grossAmount} ⭐</time></p>)}</div>
      <h3>Stripe webhooks</h3>
      <div className="global-audit">{events.map((item) => <p key={item.id}><span><b>{item.type}</b><small>{item.status} · попыток {item.attempts}{item.lastError ? ` · ${item.lastError}` : ""}</small></span><time>{new Date(item.createdAt).toLocaleString("ru")}</time></p>)}</div>
      {!ledger.length && !events.length && !error && <p className="muted">Финансовых событий пока нет.</p>}
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
      request(`/platform/admin/users${query ? `?search=${encodeURIComponent(query)}` : ""}`),
      request("/platform/admin/audit?limit=50"),
    ]);
    setUsers(userItems);
    setAudit(auditItems);
  };
  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);
  const find = async (event: any) => { event.preventDefault(); setError(""); try { await load(search); } catch (e: any) { setError(e.message); } };
  const changeRole = async (user: any, platformRole: string) => {
    setError("");
    try {
      await request(`/platform/admin/users/${user.id}/role`, "PATCH", { platformRole });
      await load(search);
    } catch (e: any) { setError(e.message); }
  };
  return (
    <>
      <h3>Сотрудники платформы</h3>
      <form className="staff-search" onSubmit={find}><input value={search} placeholder="Имя, @username или Telegram ID" onChange={(event) => setSearch(event.target.value)} /><button>Найти</button></form>
      {error && <LoadError message={error} />}
      <div className="staff-list">{users.map((user) => <div key={user.id}><span><b>{user.firstName} {user.lastName || ""}</b><small>@{user.username || "без username"} · {user.telegramUserId}</small></span><select disabled={!canEdit} value={user.platformRole} onChange={(event) => void changeRole(user, event.target.value)}><option value="user">Пользователь</option><option value="support">Поддержка</option><option value="finance">Финансы</option><option value="platform_admin">Админ</option><option value="platform_owner">Владелец</option></select></div>)}</div>
      <h3>Глобальный журнал</h3>
      <div className="global-audit">{audit.map((item) => <p key={item.id}><span><b>{item.action}</b><small>{item.actor?.firstName || "Система"} · {item.community?.name || item.scope}</small></span><time>{new Date(item.createdAt).toLocaleString("ru")}</time></p>)}</div>
    </>
  );
}

function PlatformOwnerPanel({ canEdit }: { canEdit: boolean }) {
  const [overview, setOverview] = useState<any>();
  const [communities, setCommunities] = useState<any[]>([]);
  const [minimumStars, setMinimumStars] = useState(10);
  const [commissionPercent, setCommissionPercent] = useState(25);
  const [holdDays, setHoldDays] = useState(21);
  const [minimumPayout, setMinimumPayout] = useState(1000);
  const [ledger, setLedger] = useState<any[]>([]);
  const [billingPlans, setBillingPlans] = useState<any[]>([]);
  const [reconciliation, setReconciliation] = useState<any>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [summary, tenantItems, ledgerItems, planItems] = await Promise.all([
      request("/platform/admin/overview"),
      request("/platform/admin/communities"),
      request("/platform/admin/ledger?limit=50"),
      request("/platform/admin/billing-plans"),
    ]);
    setOverview(summary);
    setCommunities(tenantItems);
    setMinimumStars(summary.settings.minimumPublicationStars);
    setCommissionPercent(summary.settings.defaultCommissionBps / 100);
    setHoldDays(summary.settings.starsHoldDays);
    setMinimumPayout(summary.settings.minimumPayoutStars);
    setLedger(ledgerItems);
    setBillingPlans(planItems);
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
      const result = await request("/platform/admin/stars/reconcile", "POST", {});
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
      await request(`/platform/admin/payments/${payment.id}/refund`, "POST", { reason });
      setMessage("✓ Stars возвращены, объявление скрыто");
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveBillingPlan = async (plan: any) => {
    setBusy(true);
    setMessage("");
    try {
      await request(`/platform/admin/billing-plans/${plan.id}`, "PATCH", {
        stripePriceId: plan.stripePriceId,
        unitAmount: Number(plan.unitAmount),
        active: Boolean(plan.active),
      });
      setMessage(`✓ Тариф ${plan.name} сохранён`);
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
    const confirmation = window.prompt(`Необратимая финализация. Введите ID:\n${community.id}`);
    if (confirmation !== community.id) return;
    setBusy(true);
    setMessage("");
    try {
      await request(`/platform/admin/communities/${community.id}/finalize-deletion`, "POST", { confirmation });
      setMessage("✓ Персональные данные сообщества удалены, финансовый аудит сохранён");
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!overview) return <section className="platform-admin"><p>Загружаем панель платформы…</p></section>;
  const metrics = overview.metrics;
  return (
    <section className="platform-admin">
      <small>УПРАВЛЕНИЕ SAAS</small>
      <h2>Панель владельца платформы</h2>
      <div className="platform-metrics">
        <div><b>{metrics.organizations}</b><span>Организаций</span></div>
        <div><b>{metrics.activeCommunities}</b><span>Активных досок</span></div>
        <div><b>{metrics.users}</b><span>Пользователей</span></div>
        <div><b>{metrics.grossStars} ⭐</b><span>Валовый оборот</span></div>
      </div>
      {canEdit && (
        <form className="platform-settings" onSubmit={save}>
          <label>
            Минимальная цена публикации, Stars
            <input type="number" min="1" max="100000" value={minimumStars} onChange={(e) => setMinimumStars(Number(e.target.value))} />
          </label>
          <label>
            Комиссия платформы, %
            <input type="number" min="0" max="90" step="0.01" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value))} />
          </label>
          <label>
            Срок разблокировки Stars, дней
            <input type="number" min="0" max="90" value={holdDays} onChange={(e) => setHoldDays(Number(e.target.value))} />
          </label>
          <label>
            Минимум для выплаты, Stars
            <input type="number" min="1" max="10000000" value={minimumPayout} onChange={(e) => setMinimumPayout(Number(e.target.value))} />
          </label>
          <button className="primary" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить"}</button>
        </form>
      )}
      {message && <p className="platform-message">{message}</p>}
      <h3>Stripe Billing</h3>
      <div className="billing-plan-admin">
        {billingPlans.map((plan) => (
          <div key={plan.id}>
            <span><b>{plan.name}</b><small>{plan.key} · {plan.currency.toUpperCase()} / {plan.interval}</small></span>
            <label>Цена в центах<input type="number" min="0" value={plan.unitAmount} disabled={!canEdit} onChange={(event) => setBillingPlans((current) => current.map((item) => item.id === plan.id ? { ...item, unitAmount: Number(event.target.value) } : item))} /></label>
            <label>Stripe Price ID<input placeholder="price_..." value={plan.stripePriceId || ""} disabled={!canEdit} onChange={(event) => setBillingPlans((current) => current.map((item) => item.id === plan.id ? { ...item, stripePriceId: event.target.value } : item))} /></label>
            <label className="check"><input type="checkbox" checked={plan.active} disabled={!canEdit} onChange={(event) => setBillingPlans((current) => current.map((item) => item.id === plan.id ? { ...item, active: event.target.checked } : item))} />Активен</label>
            {canEdit && <button disabled={busy} onClick={() => void saveBillingPlan(plan)}>Сохранить тариф</button>}
          </div>
        ))}
      </div>
      <div className="platform-stars-tools">
        <span>
          <b>Сверка Telegram Stars</b>
          <small>Сопоставляет баланс Telegram с внутренним журналом и разблокирует созревшие начисления.</small>
        </span>
        <button className="secondary" disabled={busy} onClick={() => void reconcile()}>Сверить</button>
      </div>
      {reconciliation && (
        <p className="platform-message">Баланс: {reconciliation.balance.amount} ⭐ · Операций: {reconciliation.remoteCount} · Не сопоставлено: {reconciliation.unknownIncoming}</p>
      )}
      <h3>Финансовые операции</h3>
      <div className="platform-tenants">
        {ledger.slice(0, 15).map((transaction) => (
          <div key={transaction.id}>
            <span><b>{transaction.type.replaceAll("_", " ")}</b><small>{transaction.organization?.name || "Платформа"} · {new Date(transaction.occurredAt).toLocaleString("ru")} · {transaction.grossAmount} ⭐</small></span>
            {transaction.type === "stars_publication_paid" && transaction.payment?.status === "paid" && (
              <button className="danger-soft" disabled={busy} onClick={() => void refund(transaction.payment)}>Вернуть</button>
            )}
          </div>
        ))}
        {!ledger.length && <p className="muted">Операций пока нет.</p>}
      </div>
      <h3>Сообщества</h3>
      <div className="platform-tenants">
        {communities.map((community) => (
          <div key={community.id}>
            <span><b>{community.name}</b><small>{community.organization?.name} · {community._count.members} участников · {community._count.listings} объявлений{community.deletionScheduledFor ? ` · удаление ${new Date(community.deletionScheduledFor).toLocaleDateString("ru")}` : ""}</small></span>
            {community.deletionScheduledFor && !community.deletionFinalizedAt ? (
              <button className="danger-soft" disabled={!canEdit || new Date(community.deletionScheduledFor) > new Date()} onClick={() => void finalizeDeletion(community)}>Финализировать</button>
            ) : (
              <button disabled={Boolean(community.deletionFinalizedAt)} className={community.tenantStatus === "active" ? "danger-soft" : "primary"} onClick={() => void toggleTenant(community)}>
                {community.deletionFinalizedAt ? "Удалено" : community.tenantStatus === "active" ? "Приостановить" : "Включить"}
              </button>
            )}
          </div>
        ))}
      </div>
      <PlatformStaffManagement canEdit={canEdit} />
      <PlatformSupportPanel />
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
      <div className="logo">CB</div>
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
  const { t } = useTranslation();
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
            <small>ДОСКА ОБЪЯВЛЕНИЙ СООБЩЕСТВА</small>
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
          <div className={`access-note ${community.freeForUser ? "free" : "paid"}`}>
            <span>{community.freeForUser ? "✓" : "⭐"}</span>
            <div>
              <b>
                {community.freeForUser
                  ? "Для вас размещение бесплатно"
                  : `Публикация — ${community.publicationPriceStars} ⭐`}
              </b>
              <small>
                {community.isPrivileged
                  ? "Для администраторов сообщества без ограничений."
                  : community.freeForUser
                    ? `Активность: ${community.messageCount} из ${community.minMonthlyMessagesForFree} сообщений в этом месяце.`
                    : `До бесплатного размещения осталось ${community.messagesRemaining} сообщений в чате.`}
              </small>
            </div>
          </div>
        )}
        <button className="hero-add" onClick={() => nav("/add")}>
          ＋ Разместить объявление
        </button>
      </section>
      <div className="category-chips" aria-label="Категории">
        <button className={!categoryId ? "active" : ""} onClick={() => applyQuery({ categoryId: "" })}>
          Все
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            className={categoryId === category.id ? "active" : ""}
            onClick={() => applyQuery({ categoryId: category.id })}
          >
            <span>{category.icon || "◻"}</span> {category.name}
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
          <button type="button" className="search-clear" onClick={() => { setSearch(""); applyQuery({ search: "" }); }}>
            ×
          </button>
        )}
      </form>
      <div className="catalog-heading">
        <div>
          <small>{categoryId ? "ВЫБРАННАЯ КАТЕГОРИЯ" : "СВЕЖИЕ ОБЪЯВЛЕНИЯ"}</small>
          <h2>{loading ? "Загрузка…" : `${items.length} ${listingCountLabel(items.length)}`}</h2>
        </div>
        <select value={sort} onChange={(e) => { setSort(e.target.value); applyQuery({ sort: e.target.value }); }} aria-label="Сортировка">
          <option value="newest">Сначала новые</option>
          <option value="popular">Популярные</option>
          <option value="price_asc">Цена по возрастанию</option>
          <option value="price_desc">Цена по убыванию</option>
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
                {!item.images[0]?.url && <span className="photo-placeholder">{item.category?.icon || "📦"}</span>}
                {Boolean(item.imageCount) && <span className="photo-count">📷 {item.imageCount}</span>}
                <button
                  aria-label="Добавить в избранное"
                  className={item.isFavorite ? "favorite active" : "favorite"}
                  onClick={(event) => void toggleFavorite(event, item.id)}
                >
                  {item.isFavorite ? "♥" : "♡"}
                </button>
              </div>
              <small className="listing-category">{item.category?.icon} {item.category?.name}</small>
              <h3>{item.title}</h3>
              <strong>
                {item.priceType === "free"
                  ? "Бесплатно"
                  : item.price
                    ? `${item.price} ${item.currency}`
                    : "По договорённости"}
              </strong>
              <p>
                {item.locationText || "Сообщество"}
                {item.condition !== "not_applicable"
                  ? ` · ${conditionLabel(item.condition)}`
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
  const [data, setData] = useState<any[]>([]);
  const nav = useNavigate();
  useEffect(() => {
    request("/categories").then(setData);
  }, []);
  return (
    <section className="page">
      <h1>Категории</h1>
      <div className="category-list">
        {data.map((c) => (
          <button key={c.id} onClick={() => nav(`/?categoryId=${c.id}`)}>
            <span>{c.icon || "◻"}</span>
            {c.name}
            <b>›</b>
          </button>
        ))}
      </div>
    </section>
  );
}
function conditionLabel(value: string) {
  return (
    (
      {
        new: "Новое",
        like_new: "Как новое",
        good: "Хорошее",
        fair: "Удовлетворительное",
        for_parts: "На запчасти",
      } as Record<string, string>
    )[value] || value
  );
}
function ListingDetail() {
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
          ← Назад
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
        ← Назад
      </button>
      {item.images?.length > 0 && (
        <div className="detail-images">
          {item.images.map((image: any) => (
            <img key={image.id} src={image.url} alt={item.title} />
          ))}
        </div>
      )}
      <small>
        {item.category?.icon} {item.category?.name}
      </small>
      <h1>{item.title}</h1>
      <strong className="detail-price">
        {item.priceType === "free"
          ? "Бесплатно"
          : item.price
            ? `${item.price} ${item.currency}`
            : "По договорённости"}
      </strong>
      <p>{item.description}</p>
      <div className="detail-meta">
        <span>📍 {item.locationText || "Не указано"}</span>
        {item.condition !== "not_applicable" && (
          <span>◇ {conditionLabel(item.condition)}</span>
        )}
        <span>👁 {item.viewCount}</span>
      </div>
      {message && <div className="save-success">{message}</div>}
      <button className="primary contact-button" onClick={() => void contact()}>
        Написать автору
      </button>
    </section>
  );
}
function Create() {
  const { t } = useTranslation();
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
          <b>{c.name}</b>
          <i>{data.categoryId === c.id ? "✓" : "›"}</i>
        </button>
      ))}
    </div>,
    <input
      maxLength={80}
      placeholder="Что вы предлагаете?"
      value={data.title || ""}
      onChange={(e) => setData({ ...data, title: e.target.value })}
    />,
    <div>
      <label className={`upload ${uploading ? "busy" : ""}`}>
        ＋<b>{uploading ? "Загрузка…" : "Добавить фотографии"}</b>
        <small>JPG, PNG, WEBP или HEIC до 10 МБ</small>
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
                  <option value="">Выберите</option>
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
          <span>Состояние</span>
          <select
            value={data.condition || "good"}
            onChange={(e) => setData({ ...data, condition: e.target.value })}
          >
            <option value="new">Новое</option>
            <option value="like_new">Как новое</option>
            <option value="good">Хорошее</option>
            <option value="fair">Удовлетворительное</option>
            <option value="for_parts">На запчасти</option>
          </select>
        </label>
      )}
      {!fieldSchema.length && !conditionEnabled && (
        <p className="hint">
          Для этой категории дополнительные характеристики не нужны.
        </p>
      )}
    </div>,
    <textarea
      maxLength={3000}
      placeholder="Подробно опишите товар"
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
        <option value="fixed">Фиксированная цена</option>
        <option value="negotiable">Торг уместен</option>
        <option value="free">Бесплатно</option>
        <option value="exchange">Обмен</option>
        <option value="contact">Цена по запросу</option>
      </select>
      {!["free", "exchange", "contact"].includes(data.priceType || "fixed") && (
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Цена, EUR"
          value={data.price || ""}
          onChange={(e) => setData({ ...data, price: e.target.value })}
        />
      )}
    </div>,
    <input
      placeholder="Город или район"
      value={data.locationText || ""}
      onChange={(e) => setData({ ...data, locationText: e.target.value })}
    />,
    <select
      value={data.contactMode || "telegram"}
      onChange={(e) => setData({ ...data, contactMode: e.target.value })}
    >
      <option value="telegram">Написать в Telegram</option>
      <option value="bot">Уведомить через бота</option>
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
      <small>Шаг {step + 1} из 9</small>
      <div className="progress">
        <i style={{ width: `${((step + 1) / 9) * 100}%` }} />
      </div>
      <h1>
        {
          [
            "Категория",
            "Название",
            "Фотографии",
            "Характеристики",
            "Описание",
            "Цена",
            "Местоположение",
            "Способ связи",
            "Предпросмотр",
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
          {submitting ? "Отправка…" : step === 8 ? t("submit") : t("next")}
        </button>
      </div>
    </section>
  );
}
function Favorites() {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    request("/my/favorites").then(setData);
  }, []);
  return (
    <section className="page">
      <h1>Избранное</h1>
      {data.length ? (
        data.map((x) => <p>{x.listing.title}</p>)
      ) : (
        <div className="empty">
          <span>♡</span>
          <h3>Здесь будут избранные объявления</h3>
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
      {["moderator", "admin", "owner"].includes(me?.role) && (
        <NavLink className="admin admin-prominent" to="/admin">
          <span>
            <b>Панель администратора</b>
            <small>Модерация, люди и настройки</small>
          </span>
          <b>›</b>
        </NavLink>
      )}
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
      {view === "settings" && <AdminSettings />}
      {view === "audit" && <AdminAudit />}
    </section>
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
        <NavLink to="/admin/settings">
          <b>⚙</b>
          <span>Активность и Stars</span>
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
        minMonthlyMessagesForFree: settings.minMonthlyMessagesForFree,
        publicationPriceStars: settings.publicationPriceStars,
        allowPaidNonMembers: settings.allowPaidNonMembers,
        rules: settings.rules,
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
      <h2>Доступ и Telegram Stars</h2>
      <p className="hint">
        Активность считается по сообщениям в привязанной группе за текущий
        календарный месяц.
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
          <label>
            <span>Сообщений в месяц для бесплатной публикации</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="10000"
              value={settings.minMonthlyMessagesForFree}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  minMonthlyMessagesForFree: Number(event.target.value),
                })
              }
            />
            <small>0 — бесплатно для всех участников</small>
          </label>
          <label>
            <span>Цена одной публикации, Stars</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="10000"
              value={settings.publicationPriceStars}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  publicationPriceStars: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.allowPaidNonMembers}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  allowPaidNonMembers: event.target.checked,
                })
              }
            />
            <span>Разрешить платную публикацию людям не из группы</span>
          </label>
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
            disabled={
              saving ||
              settings.minMonthlyMessagesForFree < 0 ||
              settings.publicationPriceStars < 1
            }
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

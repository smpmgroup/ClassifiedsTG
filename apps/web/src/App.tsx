import { useEffect, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, login, request } from "./api";
type Listing = {
  id: string;
  title: string;
  price?: string;
  currency: string;
  locationText?: string;
  condition: string;
  images: { url?: string }[];
};
export function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<
    "loading" | "ready" | "outside" | "denied" | "error"
  >(sessionStorage.token ? "ready" : "loading");
  const [invite, setInvite] = useState("");
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
      await login(init);
      setState("ready");
    } catch (e: any) {
      if (e.code === "NOT_GROUP_MEMBER") {
        setInvite(e.body?.inviteUrl);
        setState("denied");
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
  if (state === "error")
    return (
      <Message
        text="Не удалось открыть доску"
        actions={<button onClick={boot}>{t("retry")}</button>}
      />
    );
  return (
    <Shell>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Catalog />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/add" element={<Create />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
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
  const [items, setItems] = useState<Listing[]>([]),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState("");
  const load = () => {
    setLoading(true);
    request(`/listings?search=${encodeURIComponent(search)}`)
      .then(setItems)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  return (
    <section className="page">
      <header>
        <div>
          <small>COMMUNITY BOARD</small>
          <h1>{t("newest")}</h1>
        </div>
        <div className="avatar">◉</div>
      </header>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <span>⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
        />
      </form>
      {loading ? (
        <Skeleton />
      ) : items.length ? (
        <div className="grid">
          {items.map((item) => (
            <article className="listing" key={item.id}>
              <div
                className="photo"
                style={{ backgroundImage: `url(${item.images[0]?.url || ""})` }}
              >
                <button>♡</button>
              </div>
              <h3>{item.title}</h3>
              <strong>
                {item.price
                  ? `${item.price} ${item.currency}`
                  : "По договорённости"}
              </strong>
              <p>
                {item.locationText || "Сообщество"} · {item.condition}
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
function Categories() {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    request("/categories").then(setData);
  }, []);
  return (
    <section className="page">
      <h1>Категории</h1>
      <div className="category-list">
        {data.map((c) => (
          <button key={c.id}>
            <span>{c.icon || "◻"}</span>
            {c.name}
            <b>›</b>
          </button>
        ))}
      </div>
    </section>
  );
}
function Create() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const [data, setData] = useState<any>(() =>
    JSON.parse(localStorage.getItem("draft") || "{}"),
  );
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  useEffect(() => {
    request("/categories").then(setCategories);
  }, []);
  useEffect(() => localStorage.setItem("draft", JSON.stringify(data)), [data]);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
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
          onClick={() => setData({ ...data, categoryId: c.id })}
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
    fieldSchema.length ? (
      <div className="dynamic-fields">
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
                value={data.attributes?.[field.key] || ""}
                onChange={(event) =>
                  setAttribute(field.key, event.target.value)
                }
              />
            )}
          </label>
        ))}
      </div>
    ) : (
      <select
        value={data.condition || "good"}
        onChange={(e) => setData({ ...data, condition: e.target.value })}
      >
        <option value="new">Новое</option>
        <option value="like_new">Как новое</option>
        <option value="good">Хорошее</option>
        <option value="fair">Удовлетворительное</option>
      </select>
    ),
    <textarea
      maxLength={3000}
      placeholder="Подробно опишите товар"
      value={data.description || ""}
      onChange={(e) => setData({ ...data, description: e.target.value })}
    />,
    <input
      type="number"
      placeholder="Цена"
      value={data.price || ""}
      onChange={(e) => setData({ ...data, price: e.target.value })}
    />,
    <input
      placeholder="Город или район"
      value={data.locationText || ""}
      onChange={(e) => setData({ ...data, locationText: e.target.value })}
    />,
    <select>
      <option>Написать в Telegram</option>
      <option>Уведомить через бота</option>
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
    !uploading,
    true,
    Boolean(data.description?.trim()),
    Boolean(data.price),
    Boolean(data.locationText?.trim()),
    true,
    true,
  ][step];
  const done = async () => {
    const listing = data.listingId
      ? await request(`/listings/${data.listingId}`, "PATCH", data)
      : await request("/listings", "POST", data);
    try {
      await request(`/listings/${listing.id}/transition`, "POST", {
        status: "pending",
      });
    } catch (error: any) {
      if (error.code !== "PUBLICATION_PAYMENT_REQUIRED") throw error;
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
    }
    localStorage.removeItem("draft");
    nav("/profile");
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
            fieldSchema.length ? "Характеристики" : "Состояние",
            "Описание",
            "Цена",
            "Местоположение",
            "Способ связи",
            "Предпросмотр",
          ][step]
        }
      </h1>
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
          disabled={!valid}
          className="primary"
          onClick={() => (step === 8 ? done() : setStep(step + 1))}
        >
          {step === 8 ? t("submit") : t("next")}
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
  const [section, setSection] = useState("all");
  useEffect(() => {
    request("/me").then(setMe);
    request("/my/listings").then(setAds);
  }, []);
  return (
    <section className="page">
      <h1>Профиль</h1>
      <div className="profile">
        <div className="avatar">{me?.user?.firstName?.[0]}</div>
        <div>
          <h2>{me?.user?.firstName}</h2>
          <small>{me?.role}</small>
        </div>
      </div>
      {["moderator", "admin", "owner"].includes(me?.role) && (
        <NavLink className="admin admin-prominent" to="/admin">
          <span>
            <b>Панель модератора</b>
            <small>Объявления, админы и настройки</small>
          </span>
          <b>›</b>
        </NavLink>
      )}
      <div className="stats">
        <b>
          {ads.length}
          <small>Объявлений</small>
        </b>
        <b>
          {ads.filter((x) => x.status === "published").length}
          <small>Активных</small>
        </b>
      </div>
      {[
        ["all", "Мои объявления"],
        ["draft", "Черновики"],
        ["pending", "На проверке"],
        ["changes_requested", "Требуют изменений"],
        ["sold", "Проданные"],
        ["archived", "Архив"],
        ["settings", "Настройки"],
        ["rules", "Правила"],
      ].map(([key, label]) => (
        <button
          className={`row ${section === key ? "selected" : ""}`}
          key={key}
          onClick={() => setSection(key)}
        >
          {label}
          <b>›</b>
        </button>
      ))}
      <ProfileSection
        section={section}
        ads={ads}
        privileged={["moderator", "admin", "owner"].includes(me?.role)}
      />
      {["moderator", "admin", "owner"].includes(me?.role) && (
        <NavLink className="admin-floating" to="/admin">
          ⚙ Панель модератора
        </NavLink>
      )}
    </section>
  );
}
function ProfileSection({
  section,
  ads,
  privileged,
}: {
  section: string;
  ads: any[];
  privileged: boolean;
}) {
  if (section === "settings")
    return (
      <div className="profile-panel">
        <h3>Настройки</h3>
        <p>
          {privileged
            ? "Настройки сообщества доступны в панели модератора."
            : "Личные настройки будут добавлены здесь."}
        </p>
      </div>
    );
  if (section === "rules")
    return (
      <div className="profile-panel">
        <h3>Правила публикации</h3>
        <p>
          Объявление должно быть достоверным, относиться к выбранной категории и
          не нарушать правила Telegram и сообщества.
        </p>
      </div>
    );
  const visible =
    section === "all" ? ads : ads.filter((ad) => ad.status === section);
  const statusLabels: Record<string, string> = {
    draft: "Черновик",
    pending: "На проверке",
    changes_requested: "Нужна доработка",
    published: "Опубликовано",
    sold: "Продано",
    archived: "В архиве",
  };
  return (
    <div className="profile-panel">
      <h3>Объявления</h3>
      {visible.length ? (
        visible.map((ad) => (
          <div className="profile-listing" key={ad.id}>
            <b>{ad.title || "Без названия"}</b>
            <small>{statusLabels[ad.status] || ad.status}</small>
          </div>
        ))
      ) : (
        <p className="hint">В этом разделе пока нет объявлений.</p>
      )}
    </div>
  );
}
function Admin() {
  const [d, setD] = useState<any>();
  const [q, setQ] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>();
  useEffect(() => {
    request("/admin/dashboard").then(setD);
    request("/admin/moderation").then(setQ);
    request("/admin/users").then(setUsers);
    request("/admin/settings").then(setSettings);
  }, []);
  const action = (id: string, status: string) =>
    request(`/admin/listings/${id}/transition`, "POST", {
      status,
      reason: status === "published" ? undefined : "Решение модератора",
    }).then(() => setQ(q.filter((x) => x.id !== id)));
  return (
    <section className="page">
      <h1>Панель модератора</h1>
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
      {q.map((x) => (
        <article className="moderate">
          <h3>{x.title}</h3>
          <p>{x.description}</p>
          <div>
            <button onClick={() => action(x.id, "changes_requested")}>
              Доработать
            </button>
            <button onClick={() => action(x.id, "rejected")}>Отклонить</button>
            <button
              className="primary"
              onClick={() => action(x.id, "published")}
            >
              Одобрить
            </button>
          </div>
        </article>
      ))}
      <h2>Модераторы и администраторы</h2>
      <p className="hint">
        Назначенный сотрудник должен один раз открыть личный чат с ботом, чтобы
        получать карточки модерации.
      </p>
      {users.map((member) => (
        <div className="admin-user" key={member.id}>
          <div>
            <b>{member.user.firstName}</b>
            <small>
              @{member.user.username || "без username"} · {member.role}
            </small>
            <small
              className={
                member.user.botStartedAt ? "bot-connected" : "bot-disconnected"
              }
            >
              {member.user.botStartedAt
                ? "✓ Личный чат с ботом подключён"
                : "Нужно нажать /start в личном чате"}
            </small>
          </div>
          <select
            value={member.role}
            onChange={async (event) => {
              const role = event.target.value;
              await request(`/admin/users/${member.userId}`, "PATCH", { role });
              setUsers((current) =>
                current.map((item) =>
                  item.id === member.id ? { ...item, role } : item,
                ),
              );
            }}
          >
            <option value="member">Участник</option>
            <option value="moderator">Модератор</option>
            <option value="admin">Администратор</option>
            <option value="owner">Владелец</option>
          </select>
        </div>
      ))}
      {settings && (
        <div className="admin-settings">
          <h2>Доступ и Stars</h2>
          <label>
            Сообщений за месяц для бесплатной публикации
            <input
              type="number"
              min="0"
              value={settings.minMonthlyMessagesForFree}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  minMonthlyMessagesForFree: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Цена публикации, Stars
            <input
              type="number"
              min="1"
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
            />{" "}
            Разрешить платную публикацию неучастникам
          </label>
          <button
            className="primary save-settings"
            onClick={() =>
              request("/admin/settings", "PATCH", {
                minMonthlyMessagesForFree: settings.minMonthlyMessagesForFree,
                publicationPriceStars: settings.publicationPriceStars,
                allowPaidNonMembers: settings.allowPaidNonMembers,
              })
            }
          >
            Сохранить настройки
          </button>
        </div>
      )}
    </section>
  );
}

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
import { api, login, request } from "./api";
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
  const [params] = useSearchParams();
  const [items, setItems] = useState<Listing[]>([]),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState("");
  const load = () => {
    setLoading(true);
    request(
      `/listings?search=${encodeURIComponent(search)}&categoryId=${encodeURIComponent(params.get("categoryId") || "")}`,
    )
      .then(setItems)
      .finally(() => setLoading(false));
  };
  useEffect(load, [params]);
  const toggleFavorite = async (event: any, id: string) => {
    event.stopPropagation();
    try {
      await request(`/listings/${id}/favorite`, "POST");
    } catch (error: any) {
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred("error");
    }
  };
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
            <article
              className="listing"
              key={item.id}
              onClick={() => nav(`/listings/${item.id}`)}
            >
              <div
                className="photo"
                style={{ backgroundImage: `url(${item.images[0]?.url || ""})` }}
              >
                <button
                  aria-label="Добавить в избранное"
                  onClick={(event) => void toggleFavorite(event, item.id)}
                >
                  ♡
                </button>
              </div>
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
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const [data, setData] = useState<any>(() => {
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
  const location = useLocation();
  const view = location.pathname.split("/")[2] || "dashboard";
  return (
    <section className="page admin-page">
      <header className="admin-header">
        <div>
          <small>УПРАВЛЕНИЕ СООБЩЕСТВОМ</small>
          <h1>Панель модератора</h1>
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
        minMonthlyMessagesForFree: settings.minMonthlyMessagesForFree,
        publicationPriceStars: settings.publicationPriceStars,
        allowPaidNonMembers: settings.allowPaidNonMembers,
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

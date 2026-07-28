import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const supportedLanguages = [
  ["en", "English"],
  ["es", "Español"],
  ["ca", "Català"],
  ["ru", "Русский"],
  ["uk", "Українська"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["it", "Italiano"],
  ["pt", "Português"],
] as const;

const en = {
  home: "Home", categories: "Categories", add: "Add", favorites: "Favorites",
  profile: "Profile", search: "Search listings", newest: "Latest listings",
  openTelegram: "Open this app through Telegram.",
  join: "This board is available to community members only.", retry: "Check again",
  joinGroup: "Join community", noListings: "No listings yet", create: "New listing",
  next: "Next", back: "Back", submit: "Submit for review", admin: "Administration",
  communityBoard: "Community marketplace", chooseCommunity: "Choose a community board",
  switchCommunity: "Community board", switching: "Switching…",
  switchError: "Could not switch community", language: "Language",
  all: "All", freshListings: "Fresh listings", selectedCategory: "Selected category",
  loading: "Loading…", listings_one: "{{count}} listing", listings_few: "{{count}} listings",
  listings_many: "{{count}} listings", listings_other: "{{count}} listings",
  sortNewest: "Newest first", sortPopular: "Most popular",
  sortPriceAsc: "Lowest price", sortPriceDesc: "Highest price",
  freeForYou: "Publishing is free for you", publicationPrice: "Publication — {{count}} ⭐",
  adminFree: "No limits for community administrators.",
  activity: "Activity: {{count}} of {{required}} messages in {{days}} days.",
  remaining: "{{count}} more messages to unlock free publishing.",
  publishListing: "Publish a listing", free: "Free", negotiable: "Negotiable",
  community: "Community", noDescription: "Listings from trusted community members.",
  categoriesHint: "Choose a section to see relevant community listings.",
  openBoard: "Open board", myListings: "My listings",
  boardLanguage: "Board language", boardLanguageHint: "Used for group buttons, bot messages and as the board fallback language.",
  saveLanguage: "Save language", saving: "Saving…", languageSaved: "✓ Language saved",
  step: "Step {{current}} of {{total}}", category: "Category", title: "Title",
  photos: "Photos", attributes: "Details", description: "Description", price: "Price",
  location: "Location", contactMethod: "Contact method", preview: "Preview",
  titlePlaceholder: "What are you offering?", uploadPhotos: "Add photos",
  uploadProgress: "Uploading…", imageFormats: "JPG, PNG, WEBP or HEIC up to 10 MB",
  choose: "Choose", condition: "Condition", conditionNew: "New",
  conditionLikeNew: "Like new", conditionGood: "Good", conditionFair: "Fair",
  conditionParts: "For parts", noExtraFields: "No additional details are needed for this category.",
  descriptionPlaceholder: "Describe your offer in detail", fixedPrice: "Fixed price",
  negotiablePrice: "Negotiable", exchange: "Exchange", priceOnRequest: "Price on request",
  pricePlaceholder: "Price, EUR", locationPlaceholder: "City or area",
  contactTelegram: "Message in Telegram", contactBot: "Notify through the bot",
  sending: "Sending…", contactAuthor: "Contact seller", notSpecified: "Not specified",
};

const translations: Record<string, Partial<typeof en>> = {
  en,
  es: {
    home:"Inicio",categories:"Categorías",add:"Añadir",favorites:"Favoritos",profile:"Perfil",search:"Buscar anuncios",newest:"Últimos anuncios",openTelegram:"Abre esta aplicación desde Telegram.",join:"Este tablón está disponible solo para miembros de la comunidad.",retry:"Comprobar de nuevo",joinGroup:"Unirse a la comunidad",noListings:"Todavía no hay anuncios",create:"Nuevo anuncio",next:"Siguiente",back:"Atrás",submit:"Enviar a revisión",admin:"Administración",communityBoard:"Tablón de la comunidad",chooseCommunity:"Elige un tablón",switchCommunity:"Comunidad",switching:"Cambiando…",switchError:"No se pudo cambiar de comunidad",language:"Idioma",all:"Todos",freshListings:"Anuncios recientes",selectedCategory:"Categoría seleccionada",loading:"Cargando…",listings_one:"{{count}} anuncio",listings_other:"{{count}} anuncios",sortNewest:"Más recientes",sortPopular:"Más populares",sortPriceAsc:"Precio más bajo",sortPriceDesc:"Precio más alto",freeForYou:"Publicar es gratis para ti",publicationPrice:"Publicación — {{count}} ⭐",adminFree:"Sin límites para administradores.",activity:"Actividad: {{count}} de {{required}} mensajes en {{days}} días.",remaining:"Faltan {{count}} mensajes para publicar gratis.",publishListing:"Publicar anuncio",free:"Gratis",negotiable:"A convenir",community:"Comunidad",noDescription:"Anuncios de miembros de confianza.",categoriesHint:"Elige una sección para ver los anuncios.",openBoard:"Abrir tablón",myListings:"Mis anuncios",boardLanguage:"Idioma del tablón",boardLanguageHint:"Se usa en botones, mensajes del bot y como idioma predeterminado.",saveLanguage:"Guardar idioma",saving:"Guardando…",languageSaved:"✓ Idioma guardado",
  },
  ca: {
    home:"Inici",categories:"Categories",add:"Afegir",favorites:"Preferits",profile:"Perfil",search:"Cerca anuncis",newest:"Últims anuncis",openTelegram:"Obre aquesta aplicació des de Telegram.",join:"Aquest tauler només està disponible per als membres de la comunitat.",retry:"Torna-ho a comprovar",joinGroup:"Uneix-te a la comunitat",noListings:"Encara no hi ha anuncis",create:"Nou anunci",next:"Següent",back:"Enrere",submit:"Envia a revisió",admin:"Administració",communityBoard:"Tauler de la comunitat",chooseCommunity:"Tria un tauler",switchCommunity:"Comunitat",switching:"Canviant…",switchError:"No s'ha pogut canviar de comunitat",language:"Idioma",all:"Tots",freshListings:"Anuncis recents",selectedCategory:"Categoria seleccionada",loading:"Carregant…",listings_one:"{{count}} anunci",listings_other:"{{count}} anuncis",sortNewest:"Més recents",sortPopular:"Més populars",sortPriceAsc:"Preu més baix",sortPriceDesc:"Preu més alt",freeForYou:"Publicar és gratuït per a tu",publicationPrice:"Publicació — {{count}} ⭐",adminFree:"Sense límits per als administradors.",activity:"Activitat: {{count}} de {{required}} missatges en {{days}} dies.",remaining:"Falten {{count}} missatges per publicar gratis.",publishListing:"Publica un anunci",free:"Gratuït",negotiable:"A convenir",community:"Comunitat",noDescription:"Anuncis de membres de confiança.",categoriesHint:"Tria una secció per veure els anuncis.",openBoard:"Obre el tauler",myListings:"Els meus anuncis",boardLanguage:"Idioma del tauler",boardLanguageHint:"S'utilitza als botons, missatges del bot i com a idioma predeterminat.",saveLanguage:"Desa l'idioma",saving:"Desant…",languageSaved:"✓ Idioma desat",
  },
  ru: {
    home:"Главная",categories:"Категории",add:"Добавить",favorites:"Избранное",profile:"Профиль",search:"Поиск объявлений",newest:"Последние объявления",openTelegram:"Откройте приложение через Telegram.",join:"Эта доска доступна только участникам сообщества.",retry:"Проверить снова",joinGroup:"Вступить в сообщество",noListings:"Объявлений пока нет",create:"Новое объявление",next:"Далее",back:"Назад",submit:"Отправить на проверку",admin:"Администрирование",communityBoard:"Доска объявлений сообщества",chooseCommunity:"Выберите доску сообщества",switchCommunity:"Доска сообщества",switching:"Переключаем…",switchError:"Не удалось переключить доску",language:"Язык",all:"Все",freshListings:"Свежие объявления",selectedCategory:"Выбранная категория",loading:"Загрузка…",listings_one:"{{count}} объявление",listings_few:"{{count}} объявления",listings_many:"{{count}} объявлений",listings_other:"{{count}} объявления",sortNewest:"Сначала новые",sortPopular:"Популярные",sortPriceAsc:"Цена по возрастанию",sortPriceDesc:"Цена по убыванию",freeForYou:"Для вас размещение бесплатно",publicationPrice:"Публикация — {{count}} ⭐",adminFree:"Для администраторов сообщества без ограничений.",activity:"Активность: {{count}} из {{required}} сообщений за {{days}} дней.",remaining:"До бесплатного размещения осталось {{count}} сообщений.",publishListing:"Разместить объявление",free:"Бесплатно",negotiable:"По договорённости",community:"Сообщество",noDescription:"Объявления проверенных участников сообщества.",categoriesHint:"Выберите раздел, чтобы увидеть подходящие объявления.",openBoard:"Открыть доску",myListings:"Мои объявления",boardLanguage:"Язык доски",boardLanguageHint:"Используется для кнопок группы, сообщений бота и как язык доски по умолчанию.",saveLanguage:"Сохранить язык",saving:"Сохраняем…",languageSaved:"✓ Язык сохранён",step:"Шаг {{current}} из {{total}}",category:"Категория",title:"Название",photos:"Фотографии",attributes:"Характеристики",description:"Описание",price:"Цена",location:"Местоположение",contactMethod:"Способ связи",preview:"Предпросмотр",titlePlaceholder:"Что вы предлагаете?",uploadPhotos:"Добавить фотографии",uploadProgress:"Загрузка…",imageFormats:"JPG, PNG, WEBP или HEIC до 10 МБ",choose:"Выберите",condition:"Состояние",conditionNew:"Новое",conditionLikeNew:"Как новое",conditionGood:"Хорошее",conditionFair:"Удовлетворительное",conditionParts:"На запчасти",noExtraFields:"Для этой категории дополнительные характеристики не нужны.",descriptionPlaceholder:"Подробно опишите товар или предложение",fixedPrice:"Фиксированная цена",negotiablePrice:"Торг уместен",exchange:"Обмен",priceOnRequest:"Цена по запросу",pricePlaceholder:"Цена, EUR",locationPlaceholder:"Город или район",contactTelegram:"Написать в Telegram",contactBot:"Уведомить через бота",sending:"Отправка…",contactAuthor:"Написать автору",notSpecified:"Не указано",
  },
  uk: {home:"Головна",categories:"Категорії",add:"Додати",favorites:"Обране",profile:"Профіль",search:"Пошук оголошень",openTelegram:"Відкрийте застосунок через Telegram.",join:"Ця дошка доступна лише учасникам спільноти.",retry:"Перевірити знову",joinGroup:"Приєднатися",noListings:"Оголошень поки немає",create:"Нове оголошення",next:"Далі",back:"Назад",submit:"Надіслати на перевірку",communityBoard:"Дошка оголошень спільноти",chooseCommunity:"Оберіть дошку спільноти",switchCommunity:"Спільнота",language:"Мова",all:"Усі",freshListings:"Свіжі оголошення",loading:"Завантаження…",publishListing:"Розмістити оголошення",free:"Безкоштовно",negotiable:"За домовленістю",boardLanguage:"Мова дошки",saveLanguage:"Зберегти мову"},
  fr: {home:"Accueil",categories:"Catégories",add:"Ajouter",favorites:"Favoris",profile:"Profil",search:"Rechercher",openTelegram:"Ouvrez cette application via Telegram.",join:"Ce tableau est réservé aux membres.",retry:"Réessayer",joinGroup:"Rejoindre",noListings:"Aucune annonce",create:"Nouvelle annonce",next:"Suivant",back:"Retour",submit:"Envoyer pour validation",communityBoard:"Marché de la communauté",chooseCommunity:"Choisissez une communauté",switchCommunity:"Communauté",language:"Langue",all:"Tout",freshListings:"Annonces récentes",loading:"Chargement…",publishListing:"Publier une annonce",free:"Gratuit",negotiable:"À négocier",boardLanguage:"Langue du tableau",saveLanguage:"Enregistrer la langue"},
  de: {home:"Start",categories:"Kategorien",add:"Hinzufügen",favorites:"Favoriten",profile:"Profil",search:"Anzeigen suchen",openTelegram:"Öffne diese App über Telegram.",join:"Diese Pinnwand ist nur für Mitglieder.",retry:"Erneut prüfen",joinGroup:"Beitreten",noListings:"Noch keine Anzeigen",create:"Neue Anzeige",next:"Weiter",back:"Zurück",submit:"Zur Prüfung senden",communityBoard:"Community-Marktplatz",chooseCommunity:"Community auswählen",switchCommunity:"Community",language:"Sprache",all:"Alle",freshListings:"Neue Anzeigen",loading:"Laden…",publishListing:"Anzeige aufgeben",free:"Kostenlos",negotiable:"Verhandelbar",boardLanguage:"Sprache der Pinnwand",saveLanguage:"Sprache speichern"},
  it: {home:"Home",categories:"Categorie",add:"Aggiungi",favorites:"Preferiti",profile:"Profilo",search:"Cerca annunci",openTelegram:"Apri questa app tramite Telegram.",join:"Questa bacheca è riservata ai membri.",retry:"Riprova",joinGroup:"Unisciti",noListings:"Nessun annuncio",create:"Nuovo annuncio",next:"Avanti",back:"Indietro",submit:"Invia per revisione",communityBoard:"Mercatino della community",chooseCommunity:"Scegli una community",switchCommunity:"Community",language:"Lingua",all:"Tutti",freshListings:"Annunci recenti",loading:"Caricamento…",publishListing:"Pubblica annuncio",free:"Gratis",negotiable:"Trattabile",boardLanguage:"Lingua della bacheca",saveLanguage:"Salva lingua"},
  pt: {home:"Início",categories:"Categorias",add:"Adicionar",favorites:"Favoritos",profile:"Perfil",search:"Pesquisar anúncios",openTelegram:"Abra esta aplicação pelo Telegram.",join:"Este quadro é apenas para membros.",retry:"Verificar novamente",joinGroup:"Entrar",noListings:"Ainda não há anúncios",create:"Novo anúncio",next:"Seguinte",back:"Voltar",submit:"Enviar para revisão",communityBoard:"Mercado da comunidade",chooseCommunity:"Escolha uma comunidade",switchCommunity:"Comunidade",language:"Idioma",all:"Todos",freshListings:"Anúncios recentes",loading:"A carregar…",publishListing:"Publicar anúncio",free:"Grátis",negotiable:"Negociável",boardLanguage:"Idioma do quadro",saveLanguage:"Guardar idioma"},
};

const resources = Object.fromEntries(
  supportedLanguages.map(([code]) => [
    code,
    { translation: { ...en, ...(translations[code] || {}) } },
  ]),
);
const telegramLanguage = (() => {
  try {
    const rawUser = new URLSearchParams(
      window.Telegram?.WebApp.initData || "",
    ).get("user");
    return rawUser ? String(JSON.parse(rawUser).language_code || "") : "";
  } catch {
    return "";
  }
})();
const detected = (
  localStorage.getItem("adnecta-language") ||
  telegramLanguage ||
  navigator.language ||
  "en"
).slice(0, 2).toLowerCase();

i18n.use(initReactI18next).init({
  resources,
  lng: supportedLanguages.some(([code]) => code === detected) ? detected : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
export default i18n;

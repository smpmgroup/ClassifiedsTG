export type TaxonomyField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  min?: number;
  max?: number;
};

export type CategoryTaxonomy = {
  name: string;
  icon: string;
  conditionEnabled: boolean;
  fields: TaxonomyField[];
};

export const categoryTaxonomies: CategoryTaxonomy[] = [
  {
    name: "Транспорт",
    icon: "🚗",
    conditionEnabled: true,
    fields: [
      {
        key: "vehicleType",
        label: "Тип транспорта",
        type: "select",
        required: true,
        options: [
          "Автомобиль",
          "Мотоцикл",
          "Велосипед",
          "Коммерческий",
          "Водный",
          "Запчасть",
          "Другое",
        ],
      },
      { key: "make", label: "Марка", type: "text", required: true },
      { key: "model", label: "Модель", type: "text" },
      {
        key: "year",
        label: "Год выпуска",
        type: "number",
        min: 1900,
        max: 2100,
      },
      { key: "mileage", label: "Пробег, км", type: "number", min: 0 },
      {
        key: "fuel",
        label: "Топливо",
        type: "select",
        options: [
          "Бензин",
          "Дизель",
          "Гибрид",
          "Электро",
          "Газ",
          "Не применимо",
        ],
      },
      {
        key: "transmission",
        label: "Коробка передач",
        type: "select",
        options: ["Механика", "Автомат", "Вариатор", "Робот", "Не применимо"],
      },
    ],
  },
  {
    name: "Недвижимость",
    icon: "🏠",
    conditionEnabled: false,
    fields: [
      {
        key: "dealType",
        label: "Тип сделки",
        type: "select",
        required: true,
        options: ["Продажа", "Долгосрочная аренда", "Посуточная аренда", "Ищу"],
      },
      {
        key: "propertyType",
        label: "Тип объекта",
        type: "select",
        required: true,
        options: [
          "Квартира",
          "Дом",
          "Комната",
          "Земля",
          "Гараж",
          "Коммерческая",
          "Другое",
        ],
      },
      { key: "rooms", label: "Комнат", type: "number", min: 0, max: 100 },
      { key: "area", label: "Площадь, м²", type: "number", min: 0 },
      { key: "floor", label: "Этаж", type: "number", min: -5, max: 200 },
      { key: "furnished", label: "С мебелью", type: "boolean" },
    ],
  },
  {
    name: "Электроника",
    icon: "📱",
    conditionEnabled: true,
    fields: [
      {
        key: "deviceType",
        label: "Тип устройства",
        type: "select",
        required: true,
        options: [
          "Телефон",
          "Планшет",
          "Компьютер",
          "Ноутбук",
          "Телевизор",
          "Аудио",
          "Бытовая техника",
          "Комплектующие",
          "Другое",
        ],
      },
      { key: "brand", label: "Бренд", type: "text" },
      { key: "model", label: "Модель", type: "text" },
      {
        key: "storage",
        label: "Память / объём",
        type: "text",
        placeholder: "Например, 256 GB",
      },
      { key: "warranty", label: "Есть гарантия", type: "boolean" },
    ],
  },
  {
    name: "Дом и сад",
    icon: "🪑",
    conditionEnabled: true,
    fields: [
      {
        key: "itemType",
        label: "Тип товара",
        type: "select",
        required: true,
        options: [
          "Мебель",
          "Посуда",
          "Декор",
          "Освещение",
          "Инструмент",
          "Сад и растения",
          "Ремонт",
          "Другое",
        ],
      },
      { key: "material", label: "Материал", type: "text" },
      {
        key: "dimensions",
        label: "Размеры",
        type: "text",
        placeholder: "Д × Ш × В",
      },
    ],
  },
  {
    name: "Одежда и обувь",
    icon: "👕",
    conditionEnabled: true,
    fields: [
      {
        key: "itemType",
        label: "Тип",
        type: "select",
        required: true,
        options: [
          "Одежда",
          "Обувь",
          "Сумка",
          "Аксессуар",
          "Украшение",
          "Другое",
        ],
      },
      {
        key: "audience",
        label: "Для кого",
        type: "select",
        options: ["Женское", "Мужское", "Унисекс"],
      },
      { key: "size", label: "Размер", type: "text", required: true },
      { key: "brand", label: "Бренд", type: "text" },
      { key: "material", label: "Материал", type: "text" },
    ],
  },
  {
    name: "Детские товары",
    icon: "🧸",
    conditionEnabled: true,
    fields: [
      {
        key: "itemType",
        label: "Тип товара",
        type: "select",
        required: true,
        options: [
          "Игрушка",
          "Одежда",
          "Коляска",
          "Автокресло",
          "Мебель",
          "Уход",
          "Учёба",
          "Другое",
        ],
      },
      {
        key: "ageGroup",
        label: "Возраст",
        type: "select",
        options: [
          "0–6 мес.",
          "6–12 мес.",
          "1–3 года",
          "3–6 лет",
          "6–12 лет",
          "12+ лет",
        ],
      },
      { key: "brand", label: "Бренд", type: "text" },
    ],
  },
  {
    name: "Работа",
    icon: "💼",
    conditionEnabled: false,
    fields: [
      {
        key: "occupation",
        label: "Профессия / должность",
        type: "text",
        required: true,
      },
      {
        key: "employmentType",
        label: "Занятость",
        type: "select",
        required: true,
        options: [
          "Полная",
          "Частичная",
          "Проектная",
          "Временная",
          "Стажировка",
        ],
      },
      {
        key: "workFormat",
        label: "Формат работы",
        type: "select",
        options: ["На месте", "Удалённо", "Гибрид"],
      },
      {
        key: "salaryPeriod",
        label: "Период оплаты",
        type: "select",
        options: ["В месяц", "В час", "За смену", "За проект"],
      },
      {
        key: "experience",
        label: "Опыт",
        type: "select",
        options: ["Без опыта", "1–3 года", "3–6 лет", "6+ лет"],
      },
    ],
  },
  {
    name: "Услуги",
    icon: "🛠️",
    conditionEnabled: false,
    fields: [
      { key: "serviceType", label: "Вид услуги", type: "text", required: true },
      {
        key: "deliveryMode",
        label: "Формат",
        type: "select",
        required: true,
        options: ["На месте", "С выездом", "Онлайн"],
      },
      {
        key: "availability",
        label: "Когда доступно",
        type: "text",
        placeholder: "Дни и время",
      },
    ],
  },
  {
    name: "Животные",
    icon: "🐾",
    conditionEnabled: false,
    fields: [
      {
        key: "listingType",
        label: "Тип объявления",
        type: "select",
        required: true,
        options: [
          "Отдам в добрые руки",
          "Потерялся",
          "Найден",
          "Передержка",
          "Товары для животных",
          "Другое",
        ],
      },
      {
        key: "species",
        label: "Вид животного",
        type: "select",
        required: true,
        options: [
          "Собака",
          "Кошка",
          "Птица",
          "Рыба",
          "Грызун",
          "Рептилия",
          "Другое",
          "Не применимо",
        ],
      },
      { key: "breed", label: "Порода", type: "text" },
      { key: "age", label: "Возраст", type: "text" },
      {
        key: "sex",
        label: "Пол",
        type: "select",
        options: ["Самец", "Самка", "Неизвестно", "Не применимо"],
      },
      { key: "vaccinated", label: "Вакцинировано", type: "boolean" },
    ],
  },
  {
    name: "Отдам бесплатно",
    icon: "🎁",
    conditionEnabled: true,
    fields: [
      { key: "itemType", label: "Что отдаёте", type: "text", required: true },
      {
        key: "pickup",
        label: "Условия получения",
        type: "select",
        options: ["Самовывоз", "Могу привезти", "По договорённости"],
      },
    ],
  },
  {
    name: "Обмен",
    icon: "🔄",
    conditionEnabled: true,
    fields: [
      {
        key: "offeredItem",
        label: "Что предлагаете",
        type: "text",
        required: true,
      },
      {
        key: "wantedItem",
        label: "На что хотите обменять",
        type: "text",
        required: true,
      },
      { key: "cashAdjustment", label: "Возможна доплата", type: "boolean" },
    ],
  },
  {
    name: "Другое",
    icon: "📦",
    conditionEnabled: true,
    fields: [
      {
        key: "itemType",
        label: "Тип предложения",
        type: "select",
        required: true,
        options: ["Товар", "Ищу", "Событие", "Другое"],
      },
    ],
  },
];

export function validateTaxonomyAttributes(
  schema: unknown,
  attributes: unknown,
): string[] {
  if (!Array.isArray(schema)) return [];
  const values =
    attributes && typeof attributes === "object"
      ? (attributes as Record<string, unknown>)
      : {};
  const errors: string[] = [];
  for (const field of schema as TaxonomyField[]) {
    const value = values[field.key];
    if (
      field.required &&
      (value === undefined || value === null || String(value).trim() === "")
    )
      errors.push(field.label);
    if (field.type === "number" && value !== undefined && value !== "") {
      const number = Number(value);
      if (
        !Number.isFinite(number) ||
        (field.min !== undefined && number < field.min) ||
        (field.max !== undefined && number > field.max)
      )
        errors.push(field.label);
    }
    if (
      field.type === "select" &&
      value &&
      field.options &&
      !field.options.includes(String(value))
    )
      errors.push(field.label);
  }
  return [...new Set(errors)];
}

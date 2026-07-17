import { PrismaClient, MemberRole } from '@prisma/client';

const db = new PrismaClient();
const names = ['Транспорт','Недвижимость','Электроника','Дом и сад','Одежда и обувь','Детские товары','Работа','Услуги','Животные','Отдам бесплатно','Обмен','Другое'];
const schemas: Record<string, object[]> = {
  'Транспорт': [{key:'make',label:'Марка',type:'text',required:true},{key:'model',label:'Модель',type:'text',required:true},{key:'year',label:'Год',type:'number',required:true},{key:'mileage',label:'Пробег, км',type:'number'},{key:'fuel',label:'Топливо',type:'select',options:['Бензин','Дизель','Гибрид','Электро']},{key:'transmission',label:'Коробка',type:'select',options:['Механика','Автомат']}],
  'Недвижимость': [{key:'dealType',label:'Тип сделки',type:'select',options:['Продажа','Аренда'],required:true},{key:'propertyType',label:'Тип объекта',type:'select',options:['Квартира','Дом','Комната','Коммерческая'],required:true},{key:'rooms',label:'Комнат',type:'number'},{key:'area',label:'Площадь, м²',type:'number'},{key:'floor',label:'Этаж',type:'number'}],
  'Работа': [{key:'employmentType',label:'Занятость',type:'select',options:['Полная','Частичная','Проектная','Стажировка'],required:true},{key:'salaryPeriod',label:'Период оплаты',type:'select',options:['В месяц','В час','За проект']},{key:'experience',label:'Опыт',type:'select',options:['Без опыта','1–3 года','3–6 лет','6+ лет']},{key:'remote',label:'Удалённая работа',type:'boolean'}],
  'Услуги': [{key:'serviceType',label:'Вид услуги',type:'text',required:true},{key:'deliveryMode',label:'Формат',type:'select',options:['На месте','С выездом','Онлайн']}],
  'Электроника': [{key:'brand',label:'Бренд',type:'text'},{key:'model',label:'Модель',type:'text'},{key:'warranty',label:'Гарантия',type:'boolean'}],
  'Одежда и обувь': [{key:'brand',label:'Бренд',type:'text'},{key:'size',label:'Размер',type:'text',required:true},{key:'material',label:'Материал',type:'text'}],
};
const slug = (value: string, index: number) => value.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '') || `category-${index}`;

async function seed() {
  const telegramChatId = BigInt(process.env.TELEGRAM_GROUP_ID || '-1000000000000');
  const community = await db.community.upsert({ where: { telegramChatId }, update: {}, create: { telegramChatId, name: process.env.APP_NAME || 'Community Board', slug: 'main', inviteUrl: process.env.TELEGRAM_GROUP_INVITE_URL || 'https://t.me/example' } });
  for (const [index, name] of names.entries()) await db.category.upsert({ where: { communityId_slug: { communityId: community.id, slug: slug(name,index) } }, update: {fieldSchema:schemas[name]||[]}, create: { communityId: community.id,name,slug:slug(name,index),sortOrder:index,fieldSchema:schemas[name]||[] } });
  for (const id of (process.env.INITIAL_ADMIN_TELEGRAM_IDS || '').split(',').map(value => value.trim()).filter(Boolean)) {
    const user = await db.user.upsert({ where: { telegramUserId: BigInt(id) }, update: {}, create: { telegramUserId: BigInt(id), firstName: 'Owner' } });
    await db.communityMember.upsert({ where: { communityId_userId: { communityId: community.id,userId:user.id } }, update: { role: MemberRole.owner }, create: { communityId:community.id,userId:user.id,role:MemberRole.owner } });
  }
}
seed().finally(() => db.$disconnect());

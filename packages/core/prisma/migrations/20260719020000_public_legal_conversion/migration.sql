CREATE TABLE "LegalDocument" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "publishedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LegalAcceptance" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'web',
  CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ConversionEvent" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "visitorHash" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "referrerHost" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LegalDocument_type_version_key" ON "LegalDocument"("type", "version");
CREATE INDEX "LegalDocument_type_published_effectiveAt_idx" ON "LegalDocument"("type", "published", "effectiveAt");
CREATE UNIQUE INDEX "LegalAcceptance_documentId_userId_key" ON "LegalAcceptance"("documentId", "userId");
CREATE INDEX "LegalAcceptance_userId_acceptedAt_idx" ON "LegalAcceptance"("userId", "acceptedAt");
CREATE INDEX "ConversionEvent_event_createdAt_idx" ON "ConversionEvent"("event", "createdAt");
CREATE INDEX "ConversionEvent_visitorHash_createdAt_idx" ON "ConversionEvent"("visitorHash", "createdAt");
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "LegalDocument" (id,type,version,title,body,required,published,"effectiveAt","updatedAt") VALUES
('legal_terms_beta_1','terms','beta-1','Условия использования',
'Редакция для закрытого beta-тестирования. Требует проверки юристом до коммерческого запуска.\n\n1. Сервис предоставляет сообществам техническую доску объявлений и инструменты модерации. Владелец сообщества отвечает за свои правила, модераторов и законность опубликованных предложений.\n\n2. Автор объявления отвечает за достоверность данных, права на фотографии и законность товара или услуги. Платформа не является стороной сделки между пользователями.\n\n3. Бесплатная публикация зависит от правил активности сообщества. Иные публикации внутри Telegram оплачиваются Telegram Stars. Цена показывается до оплаты.\n\n4. Платформа удерживает комиссию, зафиксированную для каждой оплаты. Доля сообщества сначала находится на удержании, может быть уменьшена возвратом или спором и становится доступной только после сверки. Срок удержания и минимальная выплата задаются платформой.\n\n5. Возврат Stars рассматривается поддержкой с учетом факта публикации, ошибки сервиса и правил Telegram. Возврат создаёт корректирующую запись; исторические операции не удаляются.\n\n6. Выплаты владельцам сообществ выполняются после проверки личности и реквизитов через доступный платёжный канал. Расчётная сумма в фиатной валюте подтверждается отдельно и не является автоматическим курсом Stars.\n\n7. Запрещены незаконные товары, мошенничество, дискриминационные предложения, опасные предметы, нарушение прав третьих лиц, спам и попытки обхода оплаты или модерации.\n\n8. Платформа может скрыть объявление, ограничить аккаунт или приостановить сообщество для безопасности, исполнения закона либо расследования спора.\n\n9. В закрытой beta возможны изменения функций и тарифов. Существенно новая редакция условий потребует нового согласия. Поддержка доступна через кабинет и команды /support и /paysupport.',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('legal_privacy_beta_1','privacy','beta-1','Политика конфиденциальности',
'Редакция для закрытого beta-тестирования. Требует проверки юристом до коммерческого запуска.\n\nСервис обрабатывает Telegram ID, имя, username, принадлежность и активность в подключённом сообществе, объявления, обращения поддержки, события модерации и платежные идентификаторы. Секретные платёжные реквизиты обрабатывают Telegram и Stripe.\n\nДанные используются для входа, изоляции сообществ, публикации и модерации, расчёта права на бесплатное размещение, предотвращения злоупотреблений, поддержки, бухгалтерского журнала и выполнения юридических обязанностей.\n\nАктивные данные сообщества доступны только его уполномоченным администраторам. Финансовые и служебные данные доступны ограниченным ролям платформы.\n\nВладелец может выгрузить данные сообщества и запросить удаление. После 30-дневного периода персональные данные псевдонимизируются, а минимальные финансовые и аудиторские записи сохраняются в объёме, необходимом для закона, возвратов и защиты от мошенничества.\n\nДля вопросов и реализации прав используйте поддержку в кабинете. Не отправляйте пароли, коды входа или полные банковские реквизиты.',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('legal_prohibited_beta_1','prohibited','beta-1','Запрещённые товары и поведение',
'Нельзя публиковать незаконные товары и услуги, оружие и опасные материалы без законного основания, наркотические вещества, украденные вещи, поддельные документы, финансовые пирамиды, эксплуатационный или сексуальный контент, торговлю людьми или животными с нарушением закона, дискриминационные вакансии, вредоносное ПО, персональные данные третьих лиц, контрафакт и предложения, нарушающие права интеллектуальной собственности.\n\nЗапрещены мошенничество, массовый спам, дубли объявлений, манипуляция активностью, обход оплаты, выдача себя за другого человека и давление на пользователей с целью получить пароль или код. Администраторы сообщества могут устанавливать более строгие правила.',false,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

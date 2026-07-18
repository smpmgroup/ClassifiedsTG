# Implementation changelog

## 2026-07-19 — Public SaaS site and versioned consent

- Replaced the outside-Telegram dead end with a responsive public landing, pricing,
  onboarding documentation, support and legal pages.
- Added privacy-minimised conversion events and 30-day aggregate funnel metrics.
- Added immutable legal-document versions, exact-version acceptance records and a
  consent gate for organisation creation, group connection, billing and payouts.
- Added platform-owner legal publishing UI and made `/terms` and `/paysupport` resolve
  current public product surfaces instead of static placeholder copy.

## 2026-07-19 — Controlled community payouts

- Added organisation payout requests with atomic available-to-reserved Stars journals,
  minimum threshold enforcement, cancellation and rejection releases.
- Added platform-owner approval with an explicit fiat snapshot and controlled manual
  SEPA or idempotent Stripe Connect execution.
- Added failed-transfer recovery, immutable completion journals, audit events and
  organisation/platform payout views.
- Kept payout intake disabled by default and documented that Stars do not fund Stripe.

## 2026-07-17 — production modernization

- Audited the upstream contest project and documented the replacement decision.
- Added PostgreSQL/Prisma normalized schema, initial migration, idempotent seed and CouchDB dry-run/import utility.
- Added verified Telegram authentication, replay prevention, group membership cache, JWT sessions, RBAC and structured errors/logging.
- Added listing lifecycle, catalog/search/filtering, drafts, raster image sanitation, favorites, views, reports, contact fallback, administration and immutable audit actions.
- Added Telegraf commands, moderation callbacks/reasons and durable notification delivery.
- Added Telegram-native Vite/React UI with safe-area navigation, theme variables, creation wizard/autosave, profile and moderation dashboard; RU/ES/EN i18n foundation.
- Added Compose services, health checks, non-root application containers, Nginx edge, CI, deployment/security/testing/backup documentation.
- Added a production Caddy TLS edge with automatic certificate renewal.
- Fixed production Mini App bootstrap by loading the official Telegram Web App bridge before React.
- Replaced the unreadable native category select with accessible selection cards and moved wizard actions above bottom navigation.
- Added real multi-image selection/upload previews, visible dark-theme carets, and durable Telegram moderation cards.
- Added database-managed moderator roles with private moderation delivery, category field schemas, monthly activity quotas, and verified Telegram Stars payment records.
# 2026-07-18 — Product hardening, admin navigation and category taxonomy

- Split the moderator area into dashboard, moderation queue, compact searchable users, settings and audit-log views.
- Added explicit pending/success/error states for role changes, moderation actions and settings saves.
- Added API-wide lossless BigInt serialization so Prisma Telegram identifiers cannot break JSON responses.
- Refresh privileged roles from the database on every authenticated request, preventing stale JWT roles after promotion or demotion.
- Added server-side bounds validation for monthly activity and Stars price settings.
- Added a maintained taxonomy for all 12 default categories, including category-specific required fields and category-level condition applicability.
- Removed item condition from real estate, jobs, services and animals; added animal-specific listing type, species, breed, age, sex and vaccination fields.
- Added server-side taxonomy validation before moderation submission and require a complete title, description, location, price where applicable and at least one image.
- Added working category filters, catalog-to-detail navigation, favorite actions, listing detail/contact view and visible form/upload errors.
- Scoped report resolution, category updates and listing contact to the authenticated community.
- Isolated unit tests from Prisma native-engine startup and added BigInt/taxonomy validation coverage.

## Profile and community rules follow-up

- Rebuilt the profile around three working areas: listings, community rules and personal preferences.
- Removed the duplicate fixed moderator button and renamed the privileged area to "Панель администратора".
- Added compact listing status filters, moderation reasons, edit/resubmit flows, sold/archive actions and an empty-state/new-listing action.
- Added persisted member preferences for listing-status notifications, buyer-interest notifications and direct Telegram contact.
- Made the bot and contact API enforce those personal preferences.
- Added one shared community-rules document, an administrator editor and a default initial policy shown verbatim to all users.

## SaaS foundation — session 1

- Replaced singleton Telegram membership and chat-photo lookups with tenant-scoped
  lookups based on the selected community's persisted chat ID.
- Added signed `start_param`, explicit community URL and existing-membership tenant
  resolution while retaining the original group ID only as a migration fallback.
- Added a community selector for users who administer or participate in multiple boards.
- Made bot board links tenant-specific and resolved group commands from the actual chat.
- Added organisations, organisation memberships, platform roles, tenant lifecycle state,
  global platform settings and immutable audit events.
- Migrated the existing community and owner into the new organisation model without
  changing listing/member IDs or losing application data.
- Added suspended-tenant enforcement and verified cross-tenant denial against a
  temporary second production tenant.

## SaaS onboarding — sessions 2–3

- Added a community-independent Telegram platform session and separate scoped token.
- Added an owner workspace listing organisations and their connected boards.
- Added first-organisation creation for new customers.
- Added short-lived, single-use, hashed connection intents and generated Telegram
  `startgroup` links from the owner workspace.
- Added bot-side requester identity and group administrator verification before tenant
  creation, plus race-safe intent claiming and immutable onboarding audit records.
- Provision new communities with owner membership and the complete maintained category
  taxonomy in one database transaction.
- Published `/connect` in the production bot command list.

## Platform control centre — session 4

- Added a platform-owner overview with organisations, active tenants, users, listings,
  paid publications and gross Stars metrics.
- Added global minimum publication price and default commission settings using integer
  basis points for deterministic percentage storage.
- Enforced the platform minimum in every community settings update.
- Added a tenant registry with organisation/member/listing counts and audited
  suspend/reactivate controls.
- Restricted platform controls to refreshed `platform_admin` and `platform_owner` roles;
  only the platform owner can change global financial defaults.

## Stars financial ledger — session 5

- Added immutable accounts, transactions and integer double-entry journal entries.
- Snapshot commission basis points and both split amounts when an invoice is created.
- Prevent an already-paid listing from being reset to pending by requesting a new link.
- Process payment state, listing entitlement and balanced journal entries atomically.
- Added idempotency by Telegram charge ID and safe duplicate-update handling.
- Added organisation finance balances/history and a global finance ledger API.
- Added deterministic rounding and balance-invariant tests.
- Verified a real three-entry journal in production and rolled the entire probe back;
  the entries summed to zero, duplicate recording returned one transaction and no test
  financial data remained.

## Telegram Stars reconciliation and refunds — session 6

- Added import of the bot's live Stars balance and transaction history with immutable,
  idempotent observations and local/remote discrepancy reporting.
- Added configurable reward hold and minimum payout thresholds to platform settings.
- Added verified settlement batches that move gross assets, community earnings and
  platform commission from pending to available in one balanced journal.
- Added role-restricted Telegram refunds with payment locking, compensating journal
  entries, listing entitlement withdrawal, user notification and audit history.
- Added finance controls to the platform-owner console and required bot commands
  `/terms`, `/support` and `/paysupport`.
- Extended ledger invariant tests to cover settlement and post-settlement reversal.

## Tenant lifecycle and data portability — session 7

- Added a customer-facing setup checklist with live bot status, administrator rights,
  required permissions, rules, branding and tenant usage counters.
- Added explicit Bot API connection checks and `my_chat_member` lifecycle handling so
  removed or demoted bots stop serving a tenant instead of leaving stale active state.
- Added reversible logical disconnect/reconnect controls that preserve all customer data
  and write immutable audit events.
- Added a versioned JSON export containing tenant settings, members, taxonomy, listings,
  images, payments, reports, moderation and audit history.
- Added guarded organisation ownership transfer to a registered Telegram user; the old
  owner becomes an administrator and cross-organisation group takeover is rejected.
- Added onboarding enforcement that refuses to activate a group until the bot is an
  administrator.

## Support, staff roles and safe deletion — session 8

- Added organisation support tickets with customer/staff conversation history,
  assignment, priorities and controlled lifecycle statuses.
- Added dedicated support-agent workspace and platform-owner management for support,
  finance, administrator and owner roles, including last-owner protection.
- Added a global immutable audit view for platform operators.
- Added export-gated deletion requests, a 30-day cancellation window and reconnect
  protection while deletion is pending.
- Added platform-owner-only finalization that removes tenant personal content and image
  files while retaining pseudonymized payment, ledger and audit records required for
  accounting, refunds and abuse investigations.

## Stripe Billing and Connect foundation — sessions 11–12

- Added database-managed SaaS plans and owner-only Stripe Checkout using allowlisted,
  remotely validated recurring Price IDs.
- Added Customer Portal sessions, subscription state and invoice reconciliation.
- Added raw-body signature verification, durable webhook idempotency, retry diagnostics
  and finance visibility for Stripe events.
- Added Stripe-hosted Connect onboarding with controller properties, Express dashboard,
  transfer capability and synchronized verification requirements.
- Added customer billing/Connect UI, platform tariff controls and a dedicated finance
  workspace.
- Kept Telegram publication purchases separate from Stripe SaaS subscriptions and
  documented the external approval/funding gates for owner payouts.

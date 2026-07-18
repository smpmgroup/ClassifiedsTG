# Implementation changelog

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

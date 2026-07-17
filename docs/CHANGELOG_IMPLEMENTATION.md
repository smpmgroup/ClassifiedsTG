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

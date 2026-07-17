# Community Board for Telegram

Production-oriented classifieds board for a Telegram community: a mobile-first Mini App, verified Telegram authentication and group membership, moderated listing workflow, favorites, reports, administration and a separate notification/moderation bot.

The original MIT-licensed contest project is preserved in Git history. Its product ideas and Telegram image option were retained; the unsafe CouchDB/shared-request identity and obsolete CRA runtime were replaced with Fastify, Prisma/PostgreSQL, Redis and Vite/React. See [initial audit](docs/INITIAL_AUDIT.md) and [architecture](docs/ARCHITECTURE.md).

## Start locally

Requirements: Docker 24+ with Compose v2, a BotFather token, a Telegram group where the bot is an administrator, and its numeric chat ID.

```bash
cp .env.example .env
# fill TELEGRAM_*, ACCESS_TOKEN_SECRET and INITIAL_ADMIN_TELEGRAM_IDS
docker compose up -d --build
docker compose exec backend npm run seed
docker compose ps
docker compose logs -f
```

The migration container applies migrations before API/bot startup. API docs are served at `/docs`; reverse-proxy health is `/health`. For host development: `npm ci`, `npm run db:generate`, then `npm run dev`.

## Telegram setup

Create the bot with BotFather, set its menu button/Mini App URL to the public HTTPS origin, add it to the target group, grant permission to read membership and publish messages, then set `TELEGRAM_GROUP_ID`. The first database owners are seeded from `INITIAL_ADMIN_TELEGRAM_IDS`; after seeding, roles live in PostgreSQL. Configure the moderation/publication chats with the corresponding environment values. Commands: `/start`, `/help`, `/myads`, `/rules`, `/board`.

## Production

Use a DNS name and TLS at an existing reverse proxy, Certbot Nginx, or Cloudflare Full (strict). Copy `.env.production.example` to `.env`, generate strong database and JWT secrets, then run `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build`. Never commit `.env`.

Back up with `scripts/backup.sh`; restore only to an empty database with `scripts/restore.sh BACKUP_DIR --confirm-empty-database`. More detail is in [deployment](docs/DEPLOYMENT.md), [Telegram setup](docs/TELEGRAM_SETUP.md), [security](docs/SECURITY.md), and [testing](docs/TESTING.md).

## Troubleshooting

- `NOT_GROUP_MEMBER`: add the bot to the group, verify the signed chat ID and retry after membership cache expiry.
- Telegram opens a blank/external page: configure a real HTTPS Mini App URL in BotFather.
- Startup stops on environment validation: compare `.env` with `.env.production.example`.
- Notification failure does not roll back a listing transition; inspect bot logs and the durable `Notification` rows.
- Old CouchDB data can be previewed with `COUCHDB_URL=... npm run migrate:couchdb:dry` and imported with `npm run migrate:couchdb`.

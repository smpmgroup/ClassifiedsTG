# Deployment

Point a DNS A record at the server, set `PUBLIC_DOMAIN`, copy `.env.production.example` to `.env`, replace every blank/`CHANGE_ME`, and run `docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build`. Caddy obtains and renews HTTPS automatically. The internal PostgreSQL and Redis ports are not published. With an existing proxy, omit Caddy and proxy HTTPS to port 8080; for Cloudflare use Full (strict), never Flexible. Verify `docker compose ps`, `curl -fsS https://DOMAIN/health`, `/docs`, bot `/board`, and an actual member/non-member login.

Updates: back up, pull the reviewed revision, rebuild, inspect the migration job and health checks. Roll back application containers to the previous revision; database migrations require a planned compatible migration, not an automatic destructive rollback.

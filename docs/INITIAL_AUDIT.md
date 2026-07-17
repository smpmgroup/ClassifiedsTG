# Initial upstream audit

Audit date: 2026-07-17. Upstream: `anton-novak/community-board-bot`, branch `public`, commit `68d1358` (2023-11-07). License: MIT.

## What was inspected and run

- Node 22.22.2, npm 10.9.7, Docker 28.5.2 and Compose 2.40.3 were available.
- Root and server `npm ci` completed. The server production audit reported 10 vulnerabilities: 3 low, 2 moderate, 4 high and 1 critical. The root install reported 1 critical vulnerability.
- The CRA frontend dependency installation emitted many deprecation warnings. Its checked-in `build/` is an old prebuilt artifact, not reproducible evidence.
- A complete runtime start cannot succeed without CouchDB and a real Telegram token; the upstream starts the bot unconditionally and has no health endpoint or configuration validation.

## Original architecture

The project is a small contest submission: React 18/Create React App/Bulma frontend; Express 4 and Telegraf 4 backend; CouchDB through Nano; TypeScript executed directly by global `ts-node`. Ads and username-to-chat mappings live in two schemaless databases. Photos are retained as Telegram `file_id` and proxied through the server. Creation/editing is implemented as a Telegraf wizard; the web application browses and deletes ads through REST endpoints.

There is no Dockerfile, Compose stack, migration, seed, OpenAPI, Redis, CI, formatter, meaningful test suite, authorization model, moderation, roles, multi-community model, audit log or background job infrastructure.

## Reusable parts

- MIT-licensed product concept, Telegram Mini App entry flow and bot commands.
- Telegram-hosted image option (`file_id`) and server-side image proxy principle.
- Existing browse/manage interaction ideas and listing fields.
- Telegraf callback and wizard experience as behavioral reference.

## Security and correctness findings

1. `initData` HMAC is compared with `===`, without constant-time comparison, expiry/auth-date validation or replay/session protection.
2. Parsed `user.username` is trusted as identity; username is optional and mutable. Authorization must use verified numeric Telegram user ID.
3. Identity is stored in shared `req.app.locals.user`, allowing concurrent requests to overwrite one another.
4. Telegram init data is placed in URL path parameters and can leak into access logs/history.
5. CORS reflects arbitrary origins with credentials. There are no secure headers, rate limits or body/upload controls.
6. No group-membership check or backend RBAC exists. Ownership checks depend on username.
7. CouchDB documents have no enforced schema/state machine/relations; destructive deletion is physical.
8. Bot token dependent startup, raw console logging, no secret redaction, no graceful shutdown and no health checks.
9. No MIME-by-content validation or multi-image upload pipeline.
10. Dependency audits found critical/high vulnerabilities; CRA/react-scripts and several transitive packages are deprecated.

## Decision

Preserve the feature concepts and Telegram image compatibility, but replace the runtime architecture. PostgreSQL is materially better for community membership, roles, categories, favorites, reports, moderation actions, notifications and uniqueness constraints. Redis supplies rate-limit, session, membership-cache and BullMQ job primitives. Fastify provides schema-oriented APIs and lower-overhead security controls. Prisma supplies normalized schema and migrations. React is retained, moved from CRA to Vite and TypeScript.

The upstream source remains recoverable in Git history. Its obsolete server/web implementation is replaced because incrementally layering production authorization and relational moderation over the shared-local/CouchDB design would be riskier and larger than a focused migration.

## Modernization plan

1. Reproducible workspace, Compose, PostgreSQL, Redis, health checks and validated environment.
2. Verified Telegram authentication, short-lived server token, membership cache and RBAC.
3. Normalized listing lifecycle, uploads, catalog/search, favorites and reports.
4. Bot moderation callbacks, durable notifications/publication jobs and audit log.
5. Telegram-native multilingual frontend and administrator surfaces.
6. Tests, CI, backup/restore, migration utility and deployment/security documentation.


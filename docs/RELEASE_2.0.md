# Adnecta 2.0

Release date: 2026-07-28

## Product model

- The public product model is community-first: customers connect one or more
  Telegram communities without managing an exposed “organization” concept.
- Community administration lives in the browser dashboard. The Telegram Mini
  App is reserved for member-facing marketplace flows.
- Platform ownership, community administration and member permissions are
  separate roles with separate entry points and server-side authorization.

## Community administration

- Separate overview, communities, moderation, reports, people, categories,
  settings, finance and support sections.
- Explicit community selector for accounts that manage multiple groups.
- Web administration uses the platform session plus a selected community ID;
  every request verifies organization membership and tenant ownership on the
  server.
- Moderation decisions, report resolutions, access changes and risk decisions
  remain auditable and tenant-isolated.

## Member experience

- One bot can open the correct board for several communities.
- Member-facing navigation contains only marketplace, publishing, favorites,
  profile and community rules.
- Draft recovery, upload feedback, category-specific fields, publication
  access checks and multilingual board selection remain supported.
- A global crash recovery screen and offline state prevent blank screens and
  clarify transient connection failures.

## Reliability and security

- Telegram profile synchronization is cached, preventing Bot API rate-limit
  storms after container restarts.
- PostgreSQL, Redis, API, worker, frontend, Nginx and Caddy have production
  health checks.
- Authentication, signed media, tenant isolation, role enforcement, payout
  journals and background jobs are covered by automated tests and the beta
  acceptance suite.
- Production acceptance result: 57 checks passed.

## Verification

- Core domain tests: 13 passed.
- Authentication and security tests: 8 passed.
- Production acceptance suite: 57 passed.
- Frontend, backend and bot production images built successfully.

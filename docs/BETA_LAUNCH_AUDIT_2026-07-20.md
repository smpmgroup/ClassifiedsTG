# Closed beta launch audit — 2026-07-20

## Verified engineering gates

- Production origin: `https://93-93-116-147.nip.io`; HTTP redirects to HTTPS, HSTS and a Telegram-compatible CSP are active.
- Public port `8080` is bound to loopback and is unreachable from outside the VPS.
- PostgreSQL contains 17 completed migrations, one current real community and three current real users.
- Bot identity is `@ITTarragonaadsbot`, it can join groups, and all eight Compose services are running; backend, frontend, Nginx, PostgreSQL, Redis and worker health checks are green.
- The self-cleaning closed-beta runner passed 37 API checks with two temporary tenants and a user belonging to both. It verified listing/favourite/moderation isolation, cross-tenant mutation denial, role boundaries, finance and support isolation, suspension, tenant-local enforcement, protected media delivery and platform-staff MFA. Cleanup returned the database to one community and three users.
- Root, API and worker builds passed; 17 unit tests and the GitHub Actions workflow passed for commits `d8d7487` and `fb00987`.
- Load smoke passed twice with 300 requests and concurrency 30: public landing p95 552 ms, health p95 822 ms, zero failed requests.
- A new daily backup was checksummed and restored into an isolated PostgreSQL 17 container: 16 migrations, one community and three users. Scheduled backup, retention and weekly restore tasks are installed; a simulated failure opened a critical alert and a successful restore resolved it.
- At audit completion there were zero open system alerts, zero dead-letter notifications and zero failed jobs in the previous 24 hours.

## Engineering findings fixed during the audit

1. Listing mutation endpoints had checked author ownership without checking the token tenant. A shared user could therefore address its own listing in another community by ID. Edit, transition, Stars payment-link, upload and image-delete paths now include `communityId`.
2. Personal listing and favourite feeds were not tenant-filtered. Both are now scoped to the current community.
3. Port 8080 exposed the internal HTTP proxy publicly. It now listens only on `127.0.0.1`.
4. The restore drill could mistake PostgreSQL's temporary initialization server for final readiness. It now requires two consecutive readiness checks.
5. Scheduled backup/restore failures previously existed only in a log. They now create deduplicated critical platform alerts and resolve them after recovery.
6. Local listing images were exposed as durable public `/uploads/*` URLs. API responses and moderator cards now receive one-hour signed media URLs, sensitive storage metadata is removed from API payloads, forged tokens are rejected and the legacy public route returns 404.
7. Privileged platform sessions previously relied on Telegram login alone. Support, finance, platform administrator and platform owner APIs now require a TOTP-verified session. Secrets are encrypted with an independent key, recovery codes are one-time keyed hashes, and TOTP steps and login challenges reject replay.
8. The mixed customer/staff support-message route had derived staff bypass from the database role without checking MFA. Unverified staff sessions can no longer cross the organization boundary or create internal messages.

## Gates that are intentionally not claimed complete

- Only one real Telegram community is connected. Roadmap session 18 requires several real communities; two additional owner-controlled test groups must complete the checklist in `CLOSED_BETA.md`.
- Stripe live keys and webhook secret are absent, so Billing and Connect cannot be accepted yet. Payout intake remains disabled.
- The current legal documents explicitly identify themselves as beta drafts; lawyer and accountant approval is still required before commercial payments and payouts.
- The Telegram bot token was shared during setup and must be rotated in BotFather before inviting external beta users. The replacement must be updated on the VPS without committing it.
- Backups are verified but still stored on the same VPS. Encrypted off-host replication needs an S3-compatible bucket or another owner-approved destination.
- SSH still permits root password authentication. A deploy account/key and recovery procedure should be confirmed before password login is disabled.
- The current platform owner must complete the guided authenticator enrollment and store the one-time recovery codes before the 2FA launch gate is operationally accepted.
- The final product domain and BotFather Web App/Login domain remain deliberately deferred until the final launch stage.

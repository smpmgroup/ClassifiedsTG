# Public site, consent and conversion measurement

The website root is public when it is opened outside Telegram without a community
context. Mini App launches keep their existing tenant routing. Public routes are
`/pricing`, `/docs`, `/terms`, `/privacy`, `/prohibited` and `/support`.

Authentication starts in the platform-owned Telegram bot on the production origin
`https://adnecta.com`. The bot opens the signed owner session without maintaining a
second password database. Telegram Mini App, browser handoff and API callbacks use
the same HTTPS origin.

Legal documents are append-only versions. The latest effective published `terms` and
`privacy` versions are required. Users must accept each exact document ID before they
can create an organisation, connect a group, start Stripe Checkout or request a payout.
Publishing a new required version makes the new consent gate appear while retaining
the timestamp and version of every historical acceptance.

The seeded beta texts are operational drafts, not a claim of legal review. A qualified
lawyer and accountant must approve them before commercial launch.

Conversion analytics accepts only an allowlist of funnel events. A browser-generated
identifier is salted and hashed by the API; raw IP addresses, Telegram identifiers and
free-form metadata are not stored. The platform console shows 30-day aggregate counts.

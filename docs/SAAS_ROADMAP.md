# Community Board SaaS roadmap

## Product model

- One platform-owned Telegram bot serves many independent communities.
- A Telegram group maps to exactly one tenant (`Community`).
- Community data is isolated by `communityId` at every API, job and storage boundary.
- Active members publish for free according to community policy.
- Paid publication inside Telegram is purchased with Telegram Stars.
- Stripe Billing charges community owners for optional SaaS plans on the public website.
- The Mini App does not offer Stripe as an alternative checkout for the same digital
  publication. Any future standalone-web payment product requires a separate compliance
  review and must not be presented as a way to bypass Telegram Stars.
- A double-entry-style internal ledger records gross Stars, refunds, platform commission,
  community earnings, reserves and payouts without rewriting historical rates.
- Community earnings are paid only after the corresponding reward is available and
  after refund/reserve checks. Stripe Connect is the preferred payout rail where the
  platform account and recipient country are supported; manual SEPA settlement is the
  controlled fallback for the first beta.

## Delivery definition

One session is one substantial, deployable work package with migration, tests,
documentation and a production or staging smoke test. Product/legal decisions and
external provider verification can create additional calendar time but do not reduce
the engineering acceptance criteria.

## Phase 1: multi-community foundation (sessions 1-4)

1. Tenant-security audit and schema evolution
   - remove singleton group assumptions;
   - add platform users, organisations, ownership and immutable audit events;
   - introduce tenant-safe query helpers and negative isolation tests.
2. Telegram web sign-in and public account shell
   - website session lifecycle, CSRF protection and account recovery path;
   - owner workspace with community creation flow.
3. Bot-to-group onboarding
   - signed deep link, `my_chat_member` lifecycle and administrator verification;
   - group selection, permissions checklist, disconnect/reconnect and ownership transfer.
4. Tenant-aware bot and Mini App routing
   - resolve tenant from launch/chat context instead of environment configuration;
   - migrate the current test community without downtime;
   - run two-community isolation smoke tests.

Milestone: two unrelated groups can use one bot and cannot access each other's data.

## Phase 2: customer and platform administration (sessions 5-8)

5. Community owner dashboard: overview, setup progress, branding and board links.
6. Community operations: moderators, rules, taxonomy, activity and pricing controls.
7. Platform owner console: tenants, roles, global limits, commission versions,
   suspensions, support and audit log.
8. Notifications and lifecycle: onboarding, permission failures, payment/refund alerts,
   tenant suspension and safe deletion/export.

Milestone: a customer can self-onboard and operate a community without server access.

## Phase 3: money, ledger and payouts (sessions 9-13)

9. Financial ledger and commission engine
   - immutable entries, idempotency, integer Stars and deterministic rounding;
   - gross, fee, community share, pending, available, reserved and reversed balances.
10. Telegram Stars production hardening
   - invoice ownership, pre-checkout validation, successful-payment reconciliation;
   - `/paysupport`, refunds, transaction import and discrepancy alerts.
11. Stripe Billing
   - website Checkout, subscriptions, invoices, webhook reconciliation and customer portal;
   - no Stripe purchase button for digital publication inside Telegram.
12. Stripe Connect onboarding
   - Express/hosted KYC, country/capability checks, payout account status and tax profile;
   - manual payout fallback when Connect funding is unavailable.
13. Payout operations
   - reserve/holding period, minimum payout, approval workflow, payout batches,
   - statements, failed payout recovery and reconciliation.

Milestone: every Star and monetary payout is explainable from an immutable transaction
history, and beta payouts can be approved safely.

## Phase 4: commercial launch (sessions 14-18)

14. Public landing, pricing, documentation, Telegram sign-in and conversion analytics.
15. Abuse prevention: message-quality activity rules, spam controls, velocity limits,
    risky listing/payment review and tenant-level enforcement.
16. Legal/product surfaces: terms acceptance versions, privacy/retention controls,
    prohibited content, support and dispute workflows.
17. Reliability: queues, scheduled reconciliation, backups/restore drill, observability,
    alerts, rate/load tests and incident runbooks.
18. Closed beta migration and launch audit with several real communities.

Milestone: controlled commercial beta with monitored payments and payouts.

## Post-beta hardening allowance (sessions 19-22)

- Fixes from real community onboarding and payment edge cases.
- UX/accessibility/browser polish and localisation.
- Accountant/legal feedback and country-specific payout changes.
- Final public-production review and gradual rollout.

## Global financial invariants

- Platform minimum publication price is greater than zero and applies to new invoices.
- Commission changes are versioned; historical transactions retain their original rate.
- No payout uses pending, disputed or reserved earnings.
- Refunds create compensating ledger entries; settled history is never edited.
- Telegram charge IDs and Stripe event IDs are unique and processed idempotently.
- Displayed fiat values are estimates until the reward is actually received.
- A community never sees another community's customers, balances or transactions.

## External launch gates

- Telegram payment terms, `/terms`, `/support` and `/paysupport` are implemented.
- Stripe approves the platform's Connect model, countries and funding method.
- The legal entity's accountant confirms VAT/tax treatment and community-owner payouts.
- Terms define platform commission, reserve, refunds, payout timing and prohibited goods.
- Two-factor authentication, secret rotation and tested backups are in place.

# Payout operations

Community earnings become eligible only after Telegram settlement moves them from
`pending` to `available`. Creating a payout request atomically reclassifies both the
platform Stars asset and the organisation payable from `available` to `reserved`.
Concurrent requests run in a serializable transaction and cannot reserve the same
balance twice.

The platform owner reviews each request and records a separate fiat amount in minor
units (for example, euro cents). This is an explicit settlement decision, not an
automatic Stars-to-EUR exchange rate. Rejection or owner cancellation releases the
entire reservation with a compensating immutable journal.

Approved beta payouts support two rails:

- `manual_sepa`: the owner records the bank transfer reference after executing it;
- `stripe_connect`: Stripe creates an idempotent Transfer to a connected account.

A failed Stripe transfer retains the Stars reservation and can be retried. A successful
execution clears the reserved Stars asset and liability, stores the external reference,
fiat amount, reviewer and timestamps, and creates an audit event. Stripe transfers
require separately funded platform Stripe balance; receipt of Telegram Stars does not
fund Stripe.

New requests remain globally disabled until the platform owner enables them after
provider, accounting and legal checks. `minimumPayoutStars` applies at request time.

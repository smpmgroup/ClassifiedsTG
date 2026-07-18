# Stripe Billing and Connect

## Product boundary

Stripe Billing charges an organisation owner for the ClassifiedsTG SaaS plan. Telegram
Stars remain the only payment method for a digital listing purchased inside Telegram.
The two products and ledgers must not be presented as interchangeable checkout methods.

Stripe Connect is the KYC and payout destination for eligible community owners. A Stars
receipt does not create Stripe balance. Actual fiat settlement therefore requires a
separately funded and reconciled payout batch; creating a connected account never makes
pending Stars payable by itself.

## Configuration

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_COUNTRY=ES
```

Platform owners configure the recurring `price_...` ID for each local `BillingPlan` in
the platform console. The API retrieves and validates a configured Price before saving
it when Stripe is enabled. Price IDs are never accepted from a customer checkout request.

Register this HTTPS endpoint in Stripe Workbench:

```text
https://<host>/api/webhooks/stripe
```

Subscribe at least to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.finalized`
- `invoice.paid`
- `invoice.payment_failed`
- `account.updated`

Webhook signatures are checked against the unmodified raw request body. Event IDs are
stored before processing; completed events are idempotent and failed events retain the
error and attempt count for Stripe retry and finance review.

## Billing lifecycle

Checkout uses hosted subscription mode and flexible billing mode. Organisation and plan
keys are copied into Checkout and Subscription metadata. Webhooks, not the browser return
URL, are authoritative for provisioning. Active customers manage payment methods,
invoices, upgrades and cancellation through a short-lived Stripe Customer Portal URL.

The local organisation record snapshots subscription status, plan, Price, period end and
cancellation state. Invoice records store amounts in the smallest currency unit and the
hosted invoice URL.

References:

- [Stripe Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Customer Portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal)

## Connect onboarding

Connected accounts use Stripe-hosted onboarding because Stripe recommends hosted or
embedded onboarding to keep changing KYC requirements current. The account configuration
uses controller properties, an Express dashboard and requested transfer capability.
Account links are single-use and are created only for authenticated organisation owners.

`account.updated` and an explicit refresh synchronize details submitted, charges/payouts
enabled and outstanding requirements. Payout code must additionally require an available
community ledger balance, the platform minimum, an enabled connected account and an
approved payout batch.

References:

- [Choose Connect onboarding](https://docs.stripe.com/connect/onboarding)
- [Account controller properties](https://docs.stripe.com/connect/migrate-to-controller-properties)
- [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)

## External launch gates

- Platform Connect onboarding and responsibility acknowledgement are complete in the
  Stripe Dashboard.
- Test-mode Checkout, Portal, webhook retry and hosted onboarding are exercised with
  Stripe test credentials.
- Live products/prices, webhook endpoint and Customer Portal configuration are created
  separately from sandbox configuration.
- Stripe confirms the intended countries and funding route for community-owner payouts.
- The accountant confirms VAT invoicing for SaaS subscriptions and the legal treatment
  of owner settlements.

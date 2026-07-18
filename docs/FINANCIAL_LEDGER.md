# Financial ledger

## Purpose

Telegram Stars are received by the platform bot, while a versioned share becomes an
obligation to the organisation that owns the community. `PublicationPayment` is the
payment workflow record; `LedgerTransaction` and `LedgerEntry` are the immutable
accounting history.

## Commission snapshot

The invoice snapshots `commissionBps` from `PlatformSetting`, then stores the computed
`platformFeeStars` and `communityShareStars`. Basis points and integer Stars avoid
floating-point money. Rounding is half-up:

```text
platform fee = floor((gross Stars * commission bps + 5000) / 10000)
community share = gross Stars - platform fee
```

Changing the global commission affects new invoices only.

## Paid-publication journal

Every successful Telegram charge produces one transaction identified by the unique
external reference `telegram-stars:<telegram_payment_charge_id>`:

| Account | Entry |
| --- | ---: |
| Platform Telegram Stars pending reward (asset) | `+gross` |
| Organisation community earnings pending (liability) | `-community share` |
| Platform commission pending (revenue) | `-platform fee` |

Entries always sum to zero. Zero-value commission/share entries are omitted. Payment
state, listing entitlement and journal creation run in one PostgreSQL transaction.
Repeated delivery of the same Telegram update returns the existing transaction.

## Rules

- Never edit or delete a settled journal transaction.
- Refunds and corrections create linked compensating transactions.
- Pending earnings cannot be paid out.
- Settlement moves all three pending balances to available balances together.
- A payout debits only an organisation's available liability account.
- External Telegram, Stripe and payout IDs are globally idempotent.
- Platform and organisation financial APIs derive balances from entries, not cached
  counters.
- A transaction is invalid unless its integer entries sum exactly to zero.

## Reconciliation and settlement

The platform finance console imports the bot's transaction history with
`getStarTransactions` and records immutable `TelegramStarObservation` rows. A hashed
fingerprint makes repeated imports safe. Incoming transactions are matched first by
Telegram charge ID and then by invoice payload; unmatched remote receipts and paid local
payments missing remotely are shown as discrepancies.

`pending_settlement` represents Telegram's reward holding period. After the configured
hold (21 days by default), only a paid journal confirmed by an incoming Telegram
observation is eligible. Settlement creates a new balanced six-entry journal moving the
asset, organisation payable and commission from pending to available accounts. It does
not rewrite the paid journal.

## Refunds

Finance roles invoke Telegram `refundStarPayment` only after the local payment has been
atomically locked as `refund_processing`. A successful external refund creates a linked
compensating journal, marks the payment refunded, removes the listing's paid entitlement
and hides it if it was live. A refund after settlement reverses both the original and
settlement journals, leaving all affected account balances at zero. Duplicate refund
requests return the existing result.

The bot exposes `/terms`, `/support` and `/paysupport`. Stripe Connect recipients and
payout journals remain separate future delivery packages.

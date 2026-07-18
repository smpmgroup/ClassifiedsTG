# Tenant lifecycle

## States

- `onboarding`: the bot is missing, demoted or the setup is incomplete; tenant sessions
  are denied and the board is not active.
- `active`: the bot is present and the customer enabled the board.
- `suspended`: a platform operator blocked the tenant; customers cannot reactivate it.
- `closed`: the customer explicitly disconnected the board. Data is retained and the
  customer can reconnect after Telegram administrator access is verified again.

Telegram `my_chat_member` updates and the manual connection check store the observed bot
status and permissions. A bot removal moves an active tenant back to onboarding. It does
not override platform suspension or an explicit customer closure.

## Customer controls

Organisation owners and administrators can check the bot, export tenant data, disconnect
and reconnect a community. Disconnect requires an explicit confirmation value and never
deletes listings, users, payments or audit history. Reconnect requires the bot to be a
current Telegram group administrator.

Exports use `classifiedstg-community-export-v1` and include the export timestamp. The
download is generated through an authenticated tenant-owner endpoint; another
organisation cannot request it.

## Deletion and retention

Deletion is never immediate. The organisation owner must download an export, enter the
explicit confirmation and then receives a 30-day cooling period. During that period the
board is closed and the owner can cancel the request. Reconnection cannot bypass a
pending deletion.

After the deadline, only a platform owner can finalize deletion and must enter the exact
community ID. Finalization removes memberships, activity, notifications, favourites,
views and image files, and scrubs listing/community personal content. The tenant
tombstone, payment records, balanced ledger and immutable audit history are retained so
refunds, accounting and fraud investigations remain explainable. This is deliberate
pseudonymizing deletion rather than an unsafe cascade through financial records.

Only the current organisation owner can transfer ownership. The recipient must already
have a ClassifiedsTG user created through Telegram sign-in. Transfer occurs in one
database transaction: all former owners become administrators, the recipient becomes the
single owner, and an immutable platform audit event is recorded.

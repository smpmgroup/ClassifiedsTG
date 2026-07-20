# Closed beta acceptance

## Automated tenant and role audit

The API image contains a self-cleaning acceptance runner:

```sh
docker compose exec -T backend node apps/api/dist/beta-acceptance.js
```

It creates two temporary organisations and communities, uses a user who belongs to both tenants, and verifies board/listing/favourite/moderation isolation, cross-tenant mutation denial, signed media delivery and tamper rejection, member/admin boundaries, organisation finance isolation, tenant suspension and tenant-local enforcement. The probe deletes all temporary rows and temporary media in a `finally` block. A successful run prints one JSON object with `ok: true` and the number of checks.

Run it after every production migration and before inviting another beta community. The audit complements, but does not replace, onboarding with actual Telegram groups because Telegram administrator permissions and real member status can only be proven against real chats.

## Real-community checklist

For each invited beta owner record the organisation, Telegram chat ID, responsible owner and acceptance date without storing access credentials.

1. Owner accepts current legal documents and creates or joins the organisation.
2. Bot is added through the signed connection link and reports administrator permissions.
3. A member opens the board from that group and cannot see another beta community.
4. Active member submits a free listing with images; moderator receives a private card and publishes it.
5. Inactive member receives the configured Stars price. Use a real payment only after the owner explicitly agrees to the beta charge and refund test.
6. Community owner sees its own ledger and cannot access another organisation.
7. Platform operator reconciles the payment, tests a refund, and records the compensating journal.
8. Owner downloads an export and verifies support, rules, moderator and suspension controls.

## Launch evidence and gates

- Engineering acceptance requires a green automated beta audit, healthy containers, no open system alert, a current verified backup and a successful isolated restore drill.
- Commercial payment acceptance additionally requires Telegram payment terms, reviewed legal texts, accountant approval of tax/VAT treatment and Stripe approval of the Connect model.
- Until those external gates are signed off, Stripe remains disabled and payouts stay in controlled beta/manual approval mode.

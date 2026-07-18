# Abuse prevention

Protection is tenant-scoped and explainable. It never silently bans a user from every
community. Each community chooses `off`, `observe` or `enforce` and configures message
quality, listing velocity, duplicate similarity and payment-invoice thresholds.

Only qualified group messages count toward free publication. Commands, very short or
low-information messages, excessive links and a rapid repeat of the previous message
increase total/rejected counters but not the qualified counter. The bot stores only a
SHA-256 fingerprint of the last normalized message, not a second copy of its content.

Before submission the API checks the community-specific daily limit, compares the
listing with the author's recent listings, scans the configured prohibited phrases and
calculates an explainable 0–100 score. Signals and matched reasons are persisted on the
listing and in `AbuseEvent`. The normal moderation queue remains authoritative.

Invoice velocity, listing risk and account age form a separate payment risk score. A
high-risk invoice is not sent to Telegram until an administrator approves it. Telegram
pre-checkout independently verifies that the stored review state is `clear` or
`approved`, in addition to invoice ownership, amount and pending status.

The Risk view shows every open signal, the score and reasons. A moderator can mark a
false positive, approve a payment or confirm/block the risk. All decisions create a
tenant moderation action. Community access restrictions live on `CommunityMember`, so
an enforcement decision in one tenant does not affect unrelated boards.

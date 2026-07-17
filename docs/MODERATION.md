# Moderation

Listings follow the single state machine in `packages/core/src/index.ts`. Pending listings are invisible publicly. Moderator decisions are transactional, role-checked and recorded in `ModerationAction`; reject/change requests require a reason. Bot callbacks re-read database roles and reject already-invalid transitions. Owners/admins manage roles; the API prevents removal of the final owner.

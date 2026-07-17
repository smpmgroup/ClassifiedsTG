# Testing

Run `npm run typecheck`, `npm test`, `npm run build`, `npm audit`, and `docker compose build`. Unit tests cover Telegram signatures/expiry/tampering and listing transition/expiration rules. Telegram HTTP must be mocked in automated integration/E2E tests; live acceptance uses dedicated member, moderator and non-member accounts against a test group.

# Telegram setup

Use BotFather to create one platform bot and set the menu/Main Mini App URL to the
HTTPS application origin. The production commands are `board`, `myads`, `rules`,
`connect` and `help`.

Community owners start self-service onboarding with `/connect` in a private chat.
The platform issues a single-use, 30-minute `startgroup` link. The exact Telegram user
who requested it must add the bot to a group where they are creator or administrator.
The bot verifies that role through Telegram before creating the tenant, initial owner
membership and default taxonomy. Only a SHA-256 hash of the connection token is stored.

The legacy `TELEGRAM_GROUP_ID` remains an optional migration fallback for the first
installation and is not used to route newly connected communities. Runtime membership,
activity, rules, board links and chat metadata resolve from each persisted Community.

Keep the bot as a group administrator and disable BotFather privacy mode so it can count
ordinary activity messages. The backend validates raw `initData`, expiry and membership;
`initDataUnsafe` is never trusted. Test creator, administrator, member, restricted, left
and kicked accounts before a public rollout.

# Telegram setup

Use BotFather to create a bot, set commands (`start`, `help`, `myads`, `rules`, `board`) and set the menu/Mini App URL to the HTTPS application origin. Add the bot as group administrator. Obtain a supergroup ID from Bot API updates or an administrative ID bot and store it as a negative `-100…` value. Set group invite URL, moderation chat and optional publication chat/thread. The backend validates raw `initData`, expiry and membership; `initDataUnsafe` is never trusted. Test creator, member, restricted, left and kicked accounts.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --workspace @board/bot --workspace @board/core --include-workspace-root
COPY packages/core packages/core
COPY apps/bot apps/bot
RUN npm run db:generate && npm run build -w @board/core && npm run build -w @board/bot
FROM node:22-alpine
RUN addgroup -S board && adduser -S board -G board
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core packages/core
COPY --from=build /app/apps/bot/dist apps/bot/dist
USER board
CMD ["node","apps/bot/dist/bot.js"]

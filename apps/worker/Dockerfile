FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --workspace @board/worker --workspace @board/core --include-workspace-root
COPY packages/core packages/core
COPY apps/worker apps/worker
RUN npm run db:generate && npm run build -w @board/core && npm run build -w @board/worker
FROM node:22-alpine
RUN addgroup -S board && adduser -S board -G board
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core packages/core
COPY --from=build /app/apps/worker/dist apps/worker/dist
USER board
CMD ["node","apps/worker/dist/worker.js"]

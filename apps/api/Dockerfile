FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --workspace @board/api --workspace @board/core --include-workspace-root
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run db:generate && npm run build -w @board/core && npm run build -w @board/api
FROM node:22-alpine
RUN apk add --no-cache curl && addgroup -S board && adduser -S board -G board
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core packages/core
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir uploads && chown -R board:board uploads
USER board
EXPOSE 3001
CMD ["node","apps/api/dist/server.js"]

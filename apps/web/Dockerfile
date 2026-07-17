FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @board/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build -w @board/web
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deployment/frontend-nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK CMD wget -q -O- http://127.0.0.1/health || exit 1

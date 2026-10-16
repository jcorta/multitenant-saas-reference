FROM node:22-slim AS build
WORKDIR /app

# Dependencies first so the layer is cached until a manifest changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci --workspace @app/api --include-workspace-root

COPY apps/api apps/api
RUN npm run build -w @app/api

# Runtime image: production dependencies, compiled API and migration/seed scripts, non-root user.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci --workspace @app/api --omit=dev --omit=peer && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations

USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/src/main.js"]

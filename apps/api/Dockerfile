FROM node:22-slim
WORKDIR /app

# Dependencies first so the layer is cached until a manifest changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci --workspace @app/api --include-workspace-root

COPY apps/api apps/api
RUN npm run build -w @app/api

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]

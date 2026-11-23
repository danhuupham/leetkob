FROM node:22.13.0-bookworm-slim AS web-builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts ./
COPY frontend ./frontend
RUN npm run build

FROM node:22.13.0-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY --from=web-builder /app/public ./public
COPY migrations ./migrations
COPY scripts ./scripts

RUN mkdir -p /data && chown node:node /data
USER node

ENV NODE_ENV=production
EXPOSE 3007
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]

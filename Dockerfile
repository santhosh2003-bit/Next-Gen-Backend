# ── Build stage ───────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ── Runtime stage ─────────────────────────────────────────
FROM node:22-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# dumb-init reaps zombies and forwards signals for graceful shutdown.
ENTRYPOINT ["dumb-init", "--"]
# Apply DB migrations on boot, then start the server (no shell/seed step needed —
# the admin account is created in-app on startup). See src/common/bootstrap.ts.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]

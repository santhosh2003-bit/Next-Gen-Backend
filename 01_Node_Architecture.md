# Backend

Framework: Fastify + TypeScript (ESM), Prisma ORM, PostgreSQL 16, Redis + BullMQ, Socket.IO.

> ✅ **Implemented.** A complete, runnable backend now lives in this folder.
> See [README.md](README.md) for setup, and the source under `src/`.

## Structure (implemented)

```
src/
  config/env.ts         # zod-validated env
  common/               # prisma, redis, queue, realtime, errors, pricing, slug, audit
  plugins/              # auth (JWT + RBAC), central error handler
  modules/              # auth, users, categories, brands, products, inventory,
                        #  cart, checkout, orders, payment, coupons, wishlist,
                        #  reviews, notifications, search, analytics
  routes/index.ts       # registers every module under /api/v1
  workers/index.ts      # BullMQ processors (notifications, analytics)
  app.ts                # buildApp() Fastify wiring
  server.ts             # listen + Socket.IO + graceful shutdown
prisma/
  schema.prisma         # full data model (all core tables + enums)
  seed.ts               # roles, permissions, admin, demo catalog, coupon
```

## Highlights

- **Auth**: JWT access + rotating refresh tokens (hashed, per-session, revocable), Argon2 hashing, RBAC (roles → permissions) enforced via route guards.
- **Catalog**: products (images/variants/attributes), categories (nested tree), brands, filtering/sorting/pagination, soft deletes.
- **Inventory**: per product/variant/warehouse `quantity`+`reserved`, reserve → commit → release lifecycle, stock movement ledger, low-stock report.
- **Cart → Checkout → Order → Payment**: coupon-aware pricing engine, inventory reservation in a transaction, Razorpay order creation, client-side verify + idempotent HMAC webhook, refunds. Order status machine with history.
- **Reviews** (verified-purchase, moderation, rating rollup), **wishlist**, **coupons**, **notifications** (in-app + realtime + push-token registry), **search** (keyword + suggestions + related + personalized recommendations), **analytics** dashboard, **audit logs**.
- **Ops**: OpenAPI/Swagger at `/docs`, health/readiness probes, rate limiting, Docker + docker-compose (postgres, redis, api, worker), Vitest unit tests.

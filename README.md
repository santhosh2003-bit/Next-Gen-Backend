# NextGen AI Commerce — Backend API

Production-grade **Fastify + TypeScript + Prisma + PostgreSQL** backend implementing every core module of the NextGen AI Commerce Platform Master Blueprint.

## Stack

| Layer       | Tech                                          |
| ----------- | --------------------------------------------- |
| Runtime     | Node.js 22 (ESM)                              |
| Framework   | Fastify 4                                     |
| ORM         | Prisma 5 + PostgreSQL 16                      |
| Cache/Queue | Redis + BullMQ                                |
| Realtime    | Socket.IO                                     |
| Auth        | JWT (access + rotating refresh), Argon2, RBAC |
| Payments    | Razorpay (orders, verify, webhooks, refunds)  |
| Validation  | Zod                                           |
| Docs        | OpenAPI / Swagger UI at `/docs`               |
| Tests       | Vitest                                        |

## Modules

`auth` · `users` · `categories` · `brands` · `products` · `inventory` · `cart` ·
`checkout` · `orders` · `payments` · `coupons` · `wishlist` · `reviews` ·
`notifications` · `search` (+ AI recommendations) · `analytics` · `audit logs`

## Quick start (Docker)

```bash
cd backend
cp .env.example .env          # adjust secrets / Razorpay keys
docker compose up --build     # postgres + redis + api + worker
# API:  http://localhost:4000/api/v1
# Docs: http://localhost:4000/docs
```

After the API is up, run migrations + seed once:

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run db:seed
```

## Quick start (local)

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate      # creates tables
npm run db:seed             # roles, admin, demo catalog, coupon
npm run dev                 # API with hot reload
npm run worker              # (separate terminal) background jobs
```

### Seeded credentials

| Role     | Email                  | Password       |
| -------- | ---------------------- | -------------- |
| Admin    | admin@nextgen.local    | `Admin@12345`  |
| Customer | customer@nextgen.local | `Customer@123` |

Demo coupon: **WELCOME10** (10% off, min ₹500, max ₹2000).

## Key flows

### Authentication

`POST /auth/register` → `POST /auth/login` → returns `{ accessToken, refreshToken }`.
Send `Authorization: Bearer <accessToken>`. Rotate with `POST /auth/refresh`.
Refresh tokens are hashed (SHA-256) and stored per-session so they can be revoked.

### Checkout → Payment (Razorpay)

1. `POST /cart/items` — build the cart.
2. `POST /cart/coupon` — (optional) apply a coupon.
3. `POST /checkout` — creates the order, **reserves inventory**, returns a
   Razorpay order (`razorpayOrderId`, `razorpayKeyId`, amount).
4. Client opens Razorpay Checkout, then calls `POST /payments/verify` with the
   handler response. Signature is verified; on success stock is committed and the
   order moves to `CONFIRMED`.
5. `POST /payments/webhook` provides a server-to-server safety net (idempotent,
   HMAC-verified) that confirms/fails payments independently of the client.

### Inventory

Stock is tracked per product/variant/warehouse with `quantity` and `reserved`.
Checkout reserves; payment capture commits (decrements); cancellation/refund
releases. Every change writes a `stock_movements` row.

## Project structure

```
backend/
  prisma/
    schema.prisma        # full data model (all core tables + enums)
    seed.ts              # roles, permissions, admin, demo catalog
  src/
    config/env.ts        # zod-validated environment
    common/              # prisma, redis, queue, realtime, errors, pricing, ...
    plugins/             # auth (JWT + RBAC), central error handler
    modules/             # one folder per domain (schema/service/routes)
    routes/index.ts      # registers all modules under /api/v1
    workers/index.ts     # BullMQ processors (notifications, analytics)
    app.ts               # buildApp() — Fastify wiring
    server.ts            # listen + Socket.IO + graceful shutdown
  test/                  # vitest unit tests
  Dockerfile
  docker-compose.yml
```

## Response envelope

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 42 } }
// error
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "...", "details": { ... } } }
```

## RBAC

Roles: `admin` (all), `manager` (catalog/orders/inventory), `customer`.
Route guards use `app.requirePermissions('product:write')` etc. `admin` bypasses
all permission checks. Permission keys are seeded and mapped to roles.

## Scripts

| Command                  | Purpose                     |
| ------------------------ | --------------------------- |
| `npm run dev`            | Dev server (hot reload)     |
| `npm run build`          | Compile to `dist/`          |
| `npm start`              | Run compiled server         |
| `npm run worker`         | Run BullMQ workers          |
| `npm run prisma:migrate` | Create/apply migrations     |
| `npm run db:seed`        | Seed baseline data          |
| `npm test`               | Run unit tests              |
| `npm run typecheck`      | Type-check without emitting |

## Notes / extension points

- **Semantic search**: `search.service.ts` uses ILIKE + in-memory re-rank. Swap
  in `pgvector`/`tsvector` for true vector/semantic search — the interface stays.
- **Push delivery**: the notification worker persists + emits realtime events and
  has a hook to integrate Expo Push / FCM (device tokens already stored).
- **Object storage**: S3 config is wired via env; plug an upload route/presigner in.

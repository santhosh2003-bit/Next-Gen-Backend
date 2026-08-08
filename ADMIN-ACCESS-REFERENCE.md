# Admin Access Reference

## Confirmed Admin Credentials

The current backend seed uses the following admin login:

- Email: `admin@nextgen.local`
- Password: `Admin@12345`

The seeded customer login is:

- Email: `customer@nextgen.local`
- Password: `Customer@123`

## What I verified

- `backend/prisma/seed.ts` defines the admin account as `admin@nextgen.local` with password `Admin@12345`.
- The seed also creates a customer account at `customer@nextgen.local`.
- The auth service loads user roles and permissions, then signs the JWT with `roles` and `permissions`.
- `backend/src/plugins/auth.ts` checks permissions using `app.requirePermissions('product:write')` and grants access if the user has the `admin` role.
- Therefore, an admin user should be able to perform product CRUD.

## Likely reasons admin CRUD might fail

1. The database was not re-seeded after code changes.
2. The app is connected to a different backend / database than expected.
3. The login request returned a token for the customer account instead of admin.
4. The `Authorization` header is missing or malformed when calling protected routes.

## Commands for this repository

### Local backend startup

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

### Docker backend startup

```bash
cd backend
docker compose up --build
# after the API is running:
docker compose exec api npm run db:seed
```

### Useful verification commands

- Type-check backend code:
  ```bash
  cd backend
  npm run typecheck
  ```
- Run backend tests:
  ```bash
  cd backend
  npm test
  ```

## Manual login verification

If the admin login still does not work, check the response from `/auth/login`:

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nextgen.local","password":"Admin@12345"}'
```

If successful, the response should include an `accessToken`. Then verify the user role:

```bash
curl http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

The response should include `roles: ["admin"]` and `permissions` containing `product:write`.

## Notes for future reference

- The exact admin credentials are fixed in `backend/prisma/seed.ts` and printed during seeding.
- If the login still fails, re-run `npm run db:seed` on the backend instance that the app is actually using.
- The admin account is the one that should be used for product CRUD and protected admin routes.

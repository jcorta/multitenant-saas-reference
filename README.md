# multitenant-saas-reference

A reference implementation of a multi-tenant SaaS for restaurant ordering. Each tenant is a restaurant with its own products and orders. The project demonstrates defense-in-depth tenant isolation: an authenticated tenant identity, application-level scoping, and PostgreSQL Row-Level Security (RLS) as the final barrier.

- **API:** NestJS, TypeScript, TypeORM
- **Web:** Nuxt 3 (Vue)
- **Database:** PostgreSQL 16
- **Tests:** Jest (unit and integration), Playwright (end-to-end)
- **Local environment:** Docker Compose

## Architecture

```
Browser ── httpOnly cookies ──▶ API (NestJS) ─────────────────────────────▶ PostgreSQL
                                 │
                                 ├─ JwtAuthGuard      verifies the RS256 token → { user, tenant, role }
                                 ├─ Interceptor       runInTenantContext(tenant):
                                 │                      BEGIN; set_config('app.tenant_id', tenant, true)
                                 ├─ AsyncLocalStorage holds the tenant and the transaction
                                 └─ TenantRepository  scopes every query to the tenant
                                                                   RLS: tenant_id = app.tenant_id
```

### Multi-tenancy

All tenants share one database and schema; every tenant-owned table carries `tenant_id`. Isolation is enforced twice:

1. **Application layer.** The tenant is read only from the verified access token, never from a header, query or body (unknown fields are rejected). A guard puts the identity on the request; an interceptor calls `runInTenantContext(tenantId, fn)`, which opens a transaction, sets the transaction-local `app.tenant_id` and stores the tenant and the transaction's entity manager in an `AsyncLocalStorage` context. Data access goes through `TenantRepository`, which merges the context tenant into every filter and stamps it on inserts, so feature code never passes a tenant by hand. `runInTenantContext` is also the entry point for background jobs or other non-HTTP callers.
2. **Database layer.** Every tenant table has RLS enabled and forced, with a policy comparing `tenant_id` to `app.tenant_id`. The API connects as a role that is neither owner nor superuser and cannot bypass RLS; with no tenant set, no rows are visible. Composite foreign keys prevent cross-tenant references.

Login and token refresh happen before the tenant is known, so they use two narrow `SECURITY DEFINER` functions; everything after that runs under RLS.

### Authentication

Login returns no token in the body. The API sets two cookies (`HttpOnly; Secure; SameSite=Strict`): a 15-minute RS256 access token (`Path=/api`) and a 7-day opaque refresh token (`Path=/api/auth`). Refresh tokens are stored hashed, rotated on every use, and reuse of a rotated token revokes the whole session family. Logout revokes the session. State-changing requests also require a custom header and a matching `Origin`.

Design decisions are recorded in [`docs/adr`](docs/adr); the full specification is in [`docs/SPEC.md`](docs/SPEC.md).

## Running locally

Prerequisites: Docker with Compose, and Node.js 22 or later (see `.nvmrc`) for tests and development mode.

### Everything in containers

```bash
docker compose up --build
```

This starts PostgreSQL, generates a development JWT key pair in `.keys/`, applies migrations, seeds data on the first run, then starts the API (<http://localhost:4000/api/health>) and the web app (<http://localhost:3000>). Ports are published on `127.0.0.1` only. Data persists in a Docker volume; `docker compose down -v` removes it.

### Development mode

```bash
cp .env.example .env
npm install
npm run keys:generate        # RS256 key pair in .keys/ (git-ignored)
npm run db:up                # PostgreSQL only
npm run db:migrate
npm run db:seed              # use db:seed:reset to wipe and reseed
npm run dev:api              # http://localhost:4000
npm run dev:web              # http://localhost:3000
```

### Seed data

Two restaurants with separate data, and an owner and a staff user in each. All seeded users share the password from `SEED_PASSWORD` (default `ChangeMe123!`, development only).

| Restaurant     | Owner                     | Staff                     |
| -------------- | ------------------------- | ------------------------- |
| Trattoria Roma | `owner@trattoria.example` | `staff@trattoria.example` |
| Sushi Kaze     | `owner@sushikaze.example` | `staff@sushikaze.example` |

Owners can manage products and orders; staff can read products and create, read and advance orders.

### Calling the API from other clients

Browsers authenticate with the cookies set at login. Other clients can send `Authorization: Bearer <access token>`, and must include an `X-Requested-With` header on `POST`, `PATCH` and `DELETE` requests; the API rejects state-changing requests without it as a cross-site request forgery safeguard.

### Troubleshooting

- **Signed out immediately in Safari:** `Secure` cookies on `http://localhost` work in Chromium-based browsers and Firefox, but may be rejected by Safari. Use Chromium or Firefox locally, or serve over HTTPS.
- **`port is already allocated`:** another process is using 3000, 4000 or 5432, often a development server started with `npm run dev:*`. Stop it, or change `DB_PORT` in `.env`.
- **Login fails after changing `SEED_PASSWORD`:** seeding runs only once. Run `npm run db:seed:reset`, or `docker compose down -v` and start again.

## Tests

The database must be running, migrated and seeded for the integration and end-to-end suites. These suites add their own records, which accumulate between runs; `npm run db:seed:reset` restores the seed data.

```bash
npm test                 # unit tests (no database needed)
npm run test:integration # API against PostgreSQL: isolation, RLS, auth, refresh rotation
npm run test:e2e         # Playwright flows (starts API and web if not already running)
npm run lint
npm run format:check
```

Playwright needs a browser once: `npx playwright install chromium`.

The tenant-isolation guarantees are covered by `apps/api/test/isolation.int-spec.ts` (HTTP level, including forged tokens and manipulated requests) and `apps/api/test/rls.int-spec.ts` (raw database connections that bypass the application layer).

## API overview

All routes are under `/api`. Lists accept `limit` (1–100) and `offset`. See [`docs/SPEC.md`](docs/SPEC.md#6-api) for request bodies and status codes.

| Route                                                                 | Roles        |
| --------------------------------------------------------------------- | ------------ |
| `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`         | public       |
| `GET /auth/me`                                                        | any          |
| `GET /products`, `GET /products/:id`                                  | owner, staff |
| `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`       | owner        |
| `GET /orders`, `GET /orders/:id`, `POST /orders`, `PATCH /orders/:id` | owner, staff |
| `DELETE /orders/:id`                                                  | owner        |
| `GET /health`                                                         | public       |

## Repository layout

```
apps/api      NestJS API: auth, tenancy, products, orders, SQL migrations, seed
apps/web      Nuxt 3 client
e2e           Playwright tests
docs          Specification and architecture decision records
docker        Database role initialisation
```

## Scope and limitations

Not included: self-service registration, password reset, product management in the web client, rate limiting, key rotation/JWKS, observability and deployment manifests. See the ADRs for the intended evolution, and [SECURITY.md](SECURITY.md) for known limitations.

## License

See [LICENSE](LICENSE).

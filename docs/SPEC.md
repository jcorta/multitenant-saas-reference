# Specification

## 1. Purpose

A reference implementation of a multi-tenant SaaS for restaurant ordering. Each tenant is a restaurant that owns its products and orders. The system demonstrates defense-in-depth tenant isolation: an authenticated tenant identity, application-level scoping and PostgreSQL Row-Level Security (RLS).

## 2. Scope

**Included:** authentication with access and refresh tokens; product and order management; two seeded tenants with an owner and a staff user each; tenant isolation in the application and the database; a web client to sign in, list orders, create orders and advance their status; unit, integration and end-to-end tests; a Docker Compose environment.

**Excluded:** self-service registration, password reset, product management in the web client, payments, inventory, internationalization, real-time updates, rate limiting, JWT key rotation, observability and deployment manifests.

## 3. Technology

| Concern          | Choice                                           |
| ---------------- | ------------------------------------------------ |
| API              | NestJS 10, TypeScript, TypeORM                   |
| Web client       | Nuxt 3 (client-rendered SPA)                     |
| Database         | PostgreSQL 16                                    |
| Password hashing | argon2id                                         |
| Tokens           | RS256 JWT access token, opaque refresh token     |
| Tests            | Jest, Supertest, Playwright                      |
| Tooling          | npm workspaces, ESLint, Prettier, Docker Compose |

## 4. Architecture

The API is a modular monolith:

| Module           | Responsibility                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ConfigModule`   | Typed configuration from environment variables.                                                                                                        |
| `DatabaseModule` | TypeORM connection as the runtime database role.                                                                                                       |
| `TenancyModule`  | `TenantContext`, `TenantRunner.runInTenantContext`, `TenantTransactionInterceptor`, `TenantRepository` base class and the `Tenant` entity.             |
| `AuthModule`     | Login, refresh, logout, current session. Exports only `JwtAuthGuard`, `RolesGuard` and `TokenService`; other modules use the `AuthenticatedUser` type. |
| `ProductsModule` | Product catalogue. Exports `ProductsRepository` for order pricing.                                                                                     |
| `OrdersModule`   | Orders, order items and status transitions.                                                                                                            |

Request pipeline for an authenticated route:

1. `CsrfGuard`: for state-changing methods, requires an `X-Requested-With` header and, when present, an `Origin` equal to the configured web origin.
2. `JwtAuthGuard`: reads the access token from the `access_token` cookie or an `Authorization: Bearer` header, verifies it (RS256, issuer, audience, expiry, claim shape) and attaches `{ userId, tenantId, role }` to the request.
3. `RolesGuard`: enforces `@Roles(...)`.
4. `TenantTransactionInterceptor`: calls `runInTenantContext(tenantId, handler)`, which opens a transaction, runs `SELECT set_config('app.tenant_id', $1, true)` and binds the tenant and the transaction's `EntityManager` in an `AsyncLocalStorage` context.
5. `ValidationPipe`: validates DTOs and rejects unknown properties (`whitelist`, `forbidNonWhitelisted`).
6. Handler and services: data access goes through `TenantRepository` subclasses, which scope every filter to the context tenant and stamp it on inserts.
7. PostgreSQL applies the RLS policy to every statement.

Public routes (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/health`) run without a tenant context.

### Running logic outside HTTP

`TenantRunner.runInTenantContext(tenantId, fn)` is the single entry point for tenant-scoped work. The HTTP interceptor is a thin wrapper over it, so background jobs, command-line tasks and other non-HTTP callers share the same isolation path. It rejects identifiers that are not UUIDs and refuses to run nested inside an existing tenant context. The caller must obtain `tenantId` from a trusted source.

## 5. Data model

All tenant-owned tables carry `tenant_id uuid NOT NULL`, are indexed with the tenant as the leading column, and use composite foreign keys `(tenant_id, …)` so rows can only reference rows of the same tenant.

| Table            | Columns                                                                                                               | RLS |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | --- |
| `tenants`        | `id`, `name`, `slug` (unique), `created_at`                                                                           | No  |
| `users`          | `id`, `tenant_id`, `email` (globally unique, lower-case), `password_hash`, `role` (`owner`/`staff`), `created_at`     | Yes |
| `products`       | `id`, `tenant_id`, `name`, `description`, `price_cents`, `currency`, `active`, `created_at`, `updated_at`             | Yes |
| `orders`         | `id`, `tenant_id`, `status`, `customer_label`, `total_cents`, `created_by`, `created_at`, `updated_at`                | Yes |
| `order_items`    | `id`, `tenant_id`, `order_id`, `product_id`, `product_name`, `unit_price_cents`, `quantity`                           | Yes |
| `refresh_tokens` | `id`, `tenant_id`, `user_id`, `family_id`, `token_hash` (unique), `expires_at`, `used_at`, `revoked_at`, `created_at` | Yes |

Prices are integer cents. Order items snapshot the product name and unit price; the order total is computed by the server.

### Row-Level Security

Every table marked above has RLS enabled and forced, with one policy for both `USING` and `WITH CHECK`:

```sql
tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
```

Without a tenant setting the expression is NULL and no row is visible or writable.

### Database roles

| Role          | Attributes                     | Used for                                                       |
| ------------- | ------------------------------ | -------------------------------------------------------------- |
| `app_owner`   | Owns the schema, `NOBYPASSRLS` | Migrations and seed. Subject to RLS because tables are forced. |
| `app_runtime` | `NOBYPASSRLS`, DML only        | The API.                                                       |
| `app_auth`    | `BYPASSRLS`, no login          | Owns the two pre-tenant lookup functions only.                 |

### Pre-tenant lookups

Login and refresh happen before the tenant is known. Two `SECURITY DEFINER` functions owned by `app_auth`, executable only by `app_runtime`, each return at most one row for an exact key: `auth_find_user_by_email(email)` and `auth_find_refresh_token(token_hash)`. All subsequent reads and writes run in the tenant context of the returned row.

## 6. API

JSON over HTTP, all routes under `/api`. Errors use NestJS's `{ statusCode, message, error }` body. Identifiers in paths must be UUIDs (otherwise `400`). List endpoints accept `limit` (1–100, default 20) and `offset` (default 0) and return `{ items, total, limit, offset }`.

| Route                  | Access         | Behaviour                                                                                                                                                        |
| ---------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/login`     | Public         | Body `{ email, password }`. Sets the session cookies and returns `{ userId, role }`. Any failure returns the same `401`.                                         |
| `POST /auth/refresh`   | Refresh cookie | Rotates the refresh token and issues a new access token. A replayed token revokes its family. Failures return `401` and clear the cookies.                       |
| `POST /auth/logout`    | Public         | Revokes the session family, if any, and clears the cookies. Returns `204`.                                                                                       |
| `GET /auth/me`         | Owner, staff   | Returns `{ id, email, role, tenant: { id, name, slug } }`.                                                                                                       |
| `GET /products`        | Owner, staff   | Lists the tenant's products.                                                                                                                                     |
| `GET /products/:id`    | Owner, staff   | `404` if absent or owned by another tenant.                                                                                                                      |
| `POST /products`       | Owner          | Body `{ name, description?, priceCents, active? }`.                                                                                                              |
| `PATCH /products/:id`  | Owner          | Partial update of the same fields.                                                                                                                               |
| `DELETE /products/:id` | Owner          | `409` if referenced by an order; deactivate it instead.                                                                                                          |
| `GET /orders`          | Owner, staff   | Optional `status` filter. Orders include their items, newest first.                                                                                              |
| `GET /orders/:id`      | Owner, staff   | `404` if absent or owned by another tenant.                                                                                                                      |
| `POST /orders`         | Owner, staff   | Body `{ customerLabel?, items: [{ productId, quantity }] }`. Repeated products are merged. `422` if any product is unknown, inactive or owned by another tenant. |
| `PATCH /orders/:id`    | Owner, staff   | Body `{ status?, customerLabel? }`. `409` for an invalid transition or a concurrent modification.                                                                |
| `DELETE /orders/:id`   | Owner          | Deletes the order and its items.                                                                                                                                 |
| `GET /health`          | Public         | Liveness check.                                                                                                                                                  |

Status transitions: `pending → preparing → served → paid`; `cancelled` is reachable from `pending` and `preparing`. `paid` and `cancelled` are final.

Resources of other tenants are indistinguishable from missing ones (`404`); `403` is reserved for role violations.

## 7. Tokens and cookies

- **Access token:** RS256 JWT, 15 minutes. Claims: `sub`, `tenant_id`, `role`, `iss`, `aud`, `iat`, `exp`. No personal data.
- **Refresh token:** 256-bit random value, 7 days, stored as a SHA-256 hash. Rotated on every use with a compare-and-set; each session has a `family_id`, and presenting a rotated token revokes the family.
- **Cookies:** both are `HttpOnly; Secure; SameSite=Strict`. The access cookie uses `Path=/api`; the refresh cookie uses `Path=/api/auth`, so it reaches only the refresh and logout endpoints. No token appears in a response body.
- **Keys:** the private key is read from `JWT_PRIVATE_KEY_PATH`, the public key from `JWT_PUBLIC_KEY_PATH`. `npm run keys:generate` creates a development pair in `.keys/`.
- **Non-browser clients** may send `Authorization: Bearer <access token>` and must include `X-Requested-With` on state-changing requests.

## 8. Web client

A client-rendered Nuxt application served separately from the API, which it calls directly with `credentials: 'include'`.

- `/login`: email and password form.
- `/orders`: restaurant name, signed-in user and role, sign-out; a form to create an order from active products with a running total; the order list with status filter, pagination and buttons for the allowed next statuses.
- On a `401`, the client performs one refresh (shared by concurrent requests) and retries once. When the session ends, a plugin redirects to `/login`. Route middleware loads the session from `/auth/me` and guards pages.

## 9. Seed data

Two tenants, Trattoria Roma and Sushi Kaze, with six products and four orders each, and users `owner@` and `staff@` on `trattoria.example` and `sushikaze.example`. All seeded users share the development password in `SEED_PASSWORD`. Seeding runs once; `npm run db:seed:reset` wipes and reseeds.

## 10. Security requirements

- The tenant is derived only from a verified token or, during refresh, from the stored token row.
- Isolation holds independently in the application layer and in the database.
- Tokens are never readable by page scripts.
- Cross-site request forgery is mitigated by `SameSite=Strict`, an `Origin` check and a required custom header.
- Authentication failures do not reveal whether an email exists.
- Secrets are not committed; development keys and `.env` are git-ignored.
- Containers run as an unprivileged user and publish ports on `127.0.0.1` only.

## 11. Testing

| Level       | Tooling                     | Covers                                                                                                                                                                                                                                              |
| ----------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Jest                        | Tenant context and runner, scoped repository, token verification including forged tokens, guards, order rules, `AuthService` login/refresh/logout, `OrdersService` status updates.                                                                  |
| Integration | Jest, Supertest, PostgreSQL | Cross-tenant isolation over HTTP; request manipulation and forged tokens; roles; cookie attributes; refresh rotation, reuse detection and logout; RLS verified with raw connections that bypass the application; `runInTenantContext` outside HTTP. |
| End-to-end  | Playwright                  | Sign in and create an order; a second tenant cannot see it; unauthenticated access redirects to sign-in.                                                                                                                                            |

Integration and end-to-end tests require a migrated and seeded database. They rely on the seeded tenants and users and add their own records, which accumulate between runs.

# Specification

## 1. Purpose
Reference implementation of a multi-tenant SaaS for restaurant ordering. Tenants are restaurants; each owns products and orders. Demonstrates defense-in-depth tenant isolation: authenticated tenant identity, application-level scoping, and PostgreSQL Row-Level Security.

## 2. Scope
In: auth (login/JWT), product CRUD, order CRUD, two seeded tenants with users, two-layer isolation, Nuxt UI (login + orders list/create), unit/integration/e2e tests, Docker Compose, ADRs.
Out: registration/onboarding, password reset, payments, inventory, i18n, real-time updates, observability stack, deployment/IaC, rate limiting (documented as future work).

## 3. Stack
NestJS + TypeScript (API), Nuxt 3 (web), PostgreSQL 16, TypeORM, Jest, Playwright, Docker Compose, npm workspaces. Passwords hashed with argon2id. JWT RS256 via `@nestjs/jwt`.

## 4. Architecture
Modular monolith. Modules: `AuthModule` (own boundary: users, credentials, token issue/verify, exposes only `AuthService` and `JwtAuthGuard`), `TenancyModule` (context, transaction interceptor, scoped repository base), `ProductsModule`, `OrdersModule`, `TenantsModule` (minimal, read model for seeding/tests). Other modules depend on Auth only through its guard and the `AuthenticatedUser` type. Auth is a separate module, not a separate service (ADR covers why, and the extraction path: publish the public key via JWKS, move user store and login to its own service or an external IdP such as Keycloak/Auth0/Cognito; consumers keep validating with the public key unchanged).

Request flow:
1. `JwtAuthGuard` verifies RS256 signature, expiry, issuer, audience; extracts `{sub, tenantId, role}`.
2. `TenantContext` (AsyncLocalStorage) stores `tenantId`, `userId`, `role` for the request. The tenant is taken **only** from the validated token; any `tenantId`/`X-Tenant-*` supplied by the client in headers, query, or body is ignored (DTO whitelist strips it; `forbidNonWhitelisted` makes body attempts a 400).
3. `TenantTransactionInterceptor` opens a transaction on the app-role connection and runs `select set_config('app.tenant_id', $1, true)` (transaction-local, pool-safe), binding the `EntityManager` into the context.
4. Services use `TenantRepository` subclasses, which obtain the manager from the context (no manager = hard error), always merge `tenantId` into filters, and always stamp `tenantId` on inserts.
5. PostgreSQL RLS policies enforce `tenant_id = current_setting('app.tenant_id', true)::uuid` for both `USING` and `WITH CHECK`; unset setting yields zero rows (fail-closed).

## 5. Data model (all tenant tables carry `tenant_id uuid not null`, indexed with `(tenant_id, …)`)
- `tenants(id, name, slug unique, created_at)` — no RLS (not tenant data); app role has SELECT only.
- `users(id, tenant_id, email unique globally, password_hash, role enum[owner,staff], created_at)` — RLS enabled.
- `products(id, tenant_id, name, description, price_cents int ≥0, currency char(3) default 'USD', active bool, created_at, updated_at)` — RLS.
- `orders(id, tenant_id, status enum[pending,preparing,served,paid,cancelled], customer_label text null, total_cents int, created_by uuid, created_at, updated_at)` — RLS.
- `order_items(id, tenant_id, order_id, product_id, product_name, unit_price_cents, quantity int >0)` — RLS; composite FKs `(tenant_id, order_id)` / `(tenant_id, product_id)` so cross-tenant references are impossible at the schema level.
- `refresh_tokens(id, tenant_id, user_id, family_id, token_hash unique, expires_at, used_at null, revoked_at null, created_at)` — RLS. Because refresh happens before a tenant is known, access goes through `SECURITY DEFINER` functions (`auth_find_refresh_token(hash)`, `auth_revoke_family(family_id)`) in addition to `auth_find_user_by_email`; the authoritative `tenant_id` then comes from the stored row, never the client.
- Prices are integer cents. Unit price and name are snapshotted at order time; total is computed server-side.

Roles: `app_owner` (owns schema, runs migrations, bypasses nothing it shouldn't — used only by migrate/seed), `app_runtime` (non-superuser, `NOBYPASSRLS`, DML only). Tables use `FORCE ROW LEVEL SECURITY`.

**Login lookup problem:** login happens before a tenant is known. A `SECURITY DEFINER` function `auth_find_user_by_email(email)` owned by the owner role returns the single matching user row (id, tenant_id, password_hash, role); `app_runtime` has EXECUTE on it and no other way around RLS on `users`. Documented in an ADR.

## 6. API (JSON, prefix `/api`)
| Method & path | Role | Notes |
|---|---|---|
| `POST /auth/login` `{email,password}` | public | Sets access + refresh cookies, body returns user summary only (no token); generic 401 on any failure; timing-safe via dummy hash on unknown email |
| `POST /auth/refresh` | refresh cookie | Rotates refresh token, issues new access cookie; reuse of a spent token revokes the family (401) |
| `POST /auth/logout` | any | Revokes family, clears cookies |
| `GET /auth/me` | any | Returns user, role, tenant |
| `GET /products`, `GET /products/:id` | owner, staff | Pagination `limit` (1–100, default 20) / `offset`; response `{items,total,limit,offset}` |
| `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` | owner | Delete returns 409 if referenced by an order (suggest `active=false`) |
| `GET /orders`, `GET /orders/:id` | owner, staff | Filter by `status`; same pagination; includes items |
| `POST /orders` `{customerLabel?, items:[{productId,quantity}]}` | owner, staff | Product must be active and in tenant else 422/404; staff and owner both |
| `PATCH /orders/:id` (status, customerLabel) | owner, staff | Status transitions: pending→preparing→served→paid; cancelled from pending/preparing; invalid → 409 |
| `DELETE /orders/:id` | owner | |
Errors use a consistent `{statusCode, error, message}` body. Cross-tenant resource ids return **404** (never 403) to avoid existence leaks. `GET /health` is public.

Staff: read products; create, read, update-status orders. Owner: everything.

## 7. Tokens and cookies
**Access token:** RS256 JWT, 15 min. Claims: `sub`, `tenant_id`, `role`, `iss`, `aud`, `iat`, `exp` only (no PII, no email). Private key only in the API (`JWT_PRIVATE_KEY_PATH`), public key via `JWT_PUBLIC_KEY_PATH`; `npm run keys:generate` creates a local pair in `.keys/` (gitignored); `.env.example` documents all variables. Guard pins RS256 (no `none`/HS confusion).
**Refresh token:** opaque 256-bit random value (not a JWT), 7-day lifetime, stored **hashed** (SHA-256) in `refresh_tokens`. Rotated on every use; each token belongs to a `family_id`; presenting an already-used token revokes the whole family (reuse detection). Logout revokes the family.
**Delivery:** the browser talks to the API directly. Both tokens are set by the API as cookies that JavaScript can never read: `HttpOnly; Secure; SameSite=Strict`, access cookie `Path=/api`, refresh cookie `Path=/api/auth` (never sent to product/order endpoints; it reaches only `POST /auth/refresh` and `POST /auth/logout`, the latter needing it to revoke the family — a path of exactly `/api/auth/refresh` would prevent logout from revoking server-side). `Secure` is kept in all environments (browsers treat `http://localhost` as a secure context). Web and API are same-site (differing ports are same-site), so `Strict` works; CORS allows only the web origin with `credentials: true`.
**CSRF:** since cookies are sent automatically, state-changing requests (POST/PATCH/DELETE, including refresh/logout) require a custom header `X-Requested-With: XMLHttpRequest`-style check plus `Origin` validation against the allowed web origin; `SameSite=Strict` is the primary defense, these are defense-in-depth. No CSRF token endpoint needed (documented in ADR).
The guard reads the access token from the cookie (an `Authorization: Bearer` header is also accepted for API/test clients).

## 8. Frontend (Nuxt 3)
Pages: `/login`, `/orders` (list with status filter + pagination, create-order form selecting active products and quantities, status update). A `useApi` composable calls the API with `credentials: 'include'`; on a 401 it performs a single-flight `POST /auth/refresh` and retries once, otherwise redirects to `/login`. Session state comes from `GET /auth/me` (token never readable by JS, so nothing is kept in localStorage). The browser calls the API directly (no Nuxt server proxy routes). Nuxt is used as a client-rendered app for authenticated pages (SSR for the login shell only), which avoids forwarding cookies server-side. Header shows restaurant name and role; logout button. Plain CSS, English UI.

## 9. Seed data
Tenants: "Trattoria Roma" and "Sushi Kaze", 6 products and 4 orders each (distinct names/prices). Users (dev-only, documented in README): `owner@trattoria.example`, `staff@trattoria.example`, `owner@sushikaze.example`, `staff@sushikaze.example`; known dev password from env `SEED_PASSWORD`.

## 10. Security requirements
- Tokens never exposed to JavaScript (httpOnly + Secure + SameSite=Strict cookies); short-lived access token, rotating refresh token with reuse detection; CSRF defense-in-depth (SameSite, Origin check, custom header).
- Tenant only from verified token; client-supplied tenant ignored.
- Isolation proven independently at app layer and DB layer.
- Helmet, CORS limited to web origin, input validation with whitelist, argon2id, no secrets in repo, generic auth errors.

## 11. Test requirements
**Unit (Jest):** `TenantContext`; guard (valid/expired/tampered/wrong-alg token); `TenantRepository` filter merging and stamping; order total and status-transition logic; role guard; auth service.
**Integration (Jest + real Postgres via compose):**
1. *Cross-tenant read isolation:* user of tenant A lists/gets/updates/deletes B's products and orders → empty/404.
2. *Request manipulation:* sending `tenant_id`/`tenantId` in body, query, and `X-Tenant-Id` header, or a token with a swapped/forged tenant claim (bad signature, HS256 with public key as secret, `alg: none`) never changes the effective tenant (ignored/400/401).
3. *RLS independent of app layer:* using the runtime connection directly, bypassing `TenantRepository`, with tenant A setting returns zero B rows; inserting a row with B's tenant id under A's setting fails; unset setting returns zero rows.
4. *Cross-tenant references:* creating an order item referencing B's product fails.
5. *Role enforcement:* staff cannot create/modify/delete products or delete orders.
6. Auth: login success/failure, expired token rejected; cookie attributes (HttpOnly, Secure, SameSite=Strict, paths); login body contains no token.
7. Refresh: rotation works; reusing a spent refresh token revokes the family; logout invalidates refresh; refresh token of tenant A never yields a token for tenant B; mutating request from a disallowed `Origin` is rejected.
**E2E (Playwright, against compose stack):** (a) log in as Trattoria owner, create an order, see it in the list; (b) log out, log in as Sushi Kaze, confirm Trattoria's order is absent and own data present. Optional third: staff cannot see product management actions.

## 12. Non-functional / conventions
Simple readable code; comments only for design rationale, in English. Conventional commits, professional messages. ADRs (Context / Decision / Alternatives considered / Consequences), English. Lint + format (ESLint, Prettier). GitHub Actions CI running lint, unit, integration (Postgres service), build. Compose services: `db`, `migrate` (one-shot), `api`, `web`.

## 13. ADRs (docs/adr)
0001 npm-workspaces monorepo · 0002 modular monolith with isolated AuthModule (and extraction path) · 0003 TypeORM · 0004 shared schema with `tenant_id` · 0005 tenant from validated JWT only · 0006 RS256 asymmetric JWT, 15-min access token + rotating opaque refresh token with reuse detection · 0007 AsyncLocalStorage context + request-scoped transaction + scoped repository · 0008 PostgreSQL RLS, FORCE, non-owner runtime role, fail-closed · 0009 login lookup via SECURITY DEFINER function · 0010 argon2id · 0011 token delivery in httpOnly/Secure/SameSite=Strict cookies set directly by the API, with CSRF defense-in-depth; alternative considered: Nuxt as a BFF (server holds tokens and proxies API calls) — not chosen because it adds a second hop and a second session layer to secure and operate, couples the API's auth to one frontend, and complicates non-browser clients, while same-site cookies already keep tokens away from JavaScript; revisit if multiple frontends or server-side token exchange are needed · 0012 testing strategy (real Postgres for RLS) · 0013 404 over 403 for cross-tenant ids.

## 14. Assumptions
Refresh token 7 days, opaque and hashed in DB; web and API share a site (localhost, different ports) so SameSite=Strict works; USD currency; argon2id; Postgres 16; GitHub Actions CI included; hard delete; limit/offset pagination; UI in English; no rate limiting (future work); dev-only seed credentials.


## 15. Running logic outside HTTP
`runInTenantContext(tenantId, fn)` opens a transaction on the runtime connection, sets `app.tenant_id` (transaction-local), binds the `TenantContext`, runs `fn`, and commits or rolls back. The HTTP `TenantTransactionInterceptor` is a thin wrapper over this helper, so background jobs, CLI tasks and future non-HTTP entry points (e.g. tool or MCP servers authenticating by other means) share exactly one isolation path. The caller is responsible for obtaining `tenantId` from a trusted source.

## 16. Browser compatibility note
`Secure` cookies on `http://localhost` are accepted by Chromium-based browsers and Firefox; Safari may reject them. Use Chromium or Firefox for local development, or serve over HTTPS.

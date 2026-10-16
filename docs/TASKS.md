# Tasks

**P0** [x] Write SPEC/PLAN/TASKS · [x] workspaces + root scripts · [x] ESLint/Prettier/editorconfig · [x] .gitignore, .env.example
**P1** [x] compose db + healthcheck · [x] migration: roles & schema · [x] migration: RLS/policies/grants · [x] SECURITY DEFINER login function · [x] seed script (2 tenants, 4 users, products, orders)
**P2** [x] TenantContext (ALS) · [x] runInTenantContext helper + test · [x] TenantTransactionInterceptor (uses helper) · [x] TenantRepository base · [x] owner/runtime DataSources
**P3** [x] keys:generate script · [x] AuthModule (login, refresh, logout, me) · [x] cookie service + CSRF/Origin check · [x] refresh_tokens rotation & reuse detection · [x] JwtAuthGuard (RS256 pinned) · [x] Roles decorator/guard · [x] argon2id hashing
**P4** [x] Products CRUD · [x] Orders CRUD + items + totals · [x] status transitions · [x] pagination DTO · [x] validation/whitelist/error format · [x] helmet/CORS/health
**P5** [x] unit tests (context, guard, repository, orders logic, roles) · [x] integration: cross-tenant isolation · [x] integration: request manipulation/forged tokens · [x] integration: RLS bypass-proof raw queries · [x] integration: cross-tenant FK · [x] integration: roles/auth
**P6** [x] Nuxt scaffold · [x] useApi with credentials + single-flight refresh · [x] login page + route middleware · [x] orders list/create/status UI
**P7** [x] API Dockerfile · [x] Web Dockerfile · [x] compose migrate/api/web · [x] verify full stack up
**P8** [x] Playwright config · [x] flow: owner creates order · [x] flow: tenant switch shows isolation
**P9** [x] ADRs 0001–0013 · [x] README · [x] GitHub Actions CI
**P10** [x] clean-checkout run of all suites · [x] docker compose up verified

## Verification
`docker compose up --build` healthy; `npm test`, `npm run test:integration`, `npm run test:e2e` green; isolation and request-manipulation suites pass; RLS raw-query test passes with app-layer scoping bypassed.

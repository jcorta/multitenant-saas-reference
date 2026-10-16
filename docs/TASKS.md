# Tasks

**P0** [ ] Write SPEC/PLAN/TASKS · [ ] workspaces + root scripts · [ ] ESLint/Prettier/editorconfig · [ ] .gitignore, .env.example
**P1** [ ] compose db + healthcheck · [ ] migration: roles & schema · [ ] migration: RLS/policies/grants · [ ] SECURITY DEFINER login function · [ ] seed script (2 tenants, 4 users, products, orders)
**P2** [ ] TenantContext (ALS) · [ ] runInTenantContext helper + test · [ ] TenantTransactionInterceptor (uses helper) · [ ] TenantRepository base · [ ] owner/runtime DataSources
**P3** [ ] keys:generate script · [ ] AuthModule (login, refresh, logout, me) · [ ] cookie service + CSRF/Origin check · [ ] refresh_tokens rotation & reuse detection · [ ] JwtAuthGuard (RS256 pinned) · [ ] Roles decorator/guard · [ ] argon2id hashing
**P4** [ ] Products CRUD · [ ] Orders CRUD + items + totals · [ ] status transitions · [ ] pagination DTO · [ ] validation/whitelist/error format · [ ] helmet/CORS/health
**P5** [ ] unit tests (context, guard, repository, orders logic, roles) · [ ] integration: cross-tenant isolation · [ ] integration: request manipulation/forged tokens · [ ] integration: RLS bypass-proof raw queries · [ ] integration: cross-tenant FK · [ ] integration: roles/auth
**P6** [ ] Nuxt scaffold · [ ] useApi with credentials + single-flight refresh · [ ] login page + route middleware · [ ] orders list/create/status UI
**P7** [ ] API Dockerfile · [ ] Web Dockerfile · [ ] compose migrate/api/web · [ ] verify full stack up
**P8** [ ] Playwright config · [ ] flow: owner creates order · [ ] flow: tenant switch shows isolation
**P9** [ ] ADRs 0001–0013 · [ ] README · [ ] GitHub Actions CI
**P10** [ ] clean-checkout run of all suites · [ ] docker compose up verified

## Verification
`docker compose up --build` healthy; `npm test`, `npm run test:integration`, `npm run test:e2e` green; isolation and request-manipulation suites pass; RLS raw-query test passes with app-layer scoping bypassed.

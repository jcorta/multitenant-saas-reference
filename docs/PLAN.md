# Implementation Plan

Phases (each ends with green checks and a commit):
- **P0 Docs & scaffolding:** SPEC/PLAN/TASKS, workspaces, lint/format, `.gitignore`, `.editorconfig`, `.env.example`.
- **P1 Database:** compose `db`, migrations (roles, tables, composite FKs, indexes, RLS + FORCE, policies, grants, `auth_find_user_by_email`), seed.
- **P2 Tenancy core:** `TenantContext`, `runInTenantContext` helper (also usable outside HTTP, e.g. jobs, tools, MCP servers), interceptor built on it, `TenantRepository`, DB module with owner and runtime DataSources.
- **P3 Auth:** `AuthModule`, key generation script, login, refresh, logout, guard, roles decorator, `/auth/me`.
- **P4 Domain:** products, orders (items, totals, status machine), pagination, error format.
- **P5 Tests (backend):** unit + integration isolation/security suite, green.
- **P6 Frontend:** Nuxt login, `useApi` composable calling the API directly (no proxy routes), orders page.
- **P7 Containerization:** Dockerfiles, compose `migrate`/`api`/`web`, verified `docker compose up --build`.
- **P8 E2E:** Playwright flows against the stack.
- **P9 Documentation & CI:** ADRs, README (overview, architecture, RLS, setup, tests), GitHub Actions.
- **P10 Final verification:** all suites green from a clean checkout, compose up, isolation tests pass.



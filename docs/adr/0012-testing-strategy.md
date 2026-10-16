# ADR 0012: Testing strategy with a real PostgreSQL

Status: Accepted

## Context

The most important properties of the system, tenant isolation and Row-Level Security, live partly in the database. Mocks or in-memory databases cannot prove them.

## Decision

Three layers:

- **Unit (Jest):** logic and guards with fakes: tenant context, tenant runner, scoped repository, token verification (including forged tokens), CSRF/role guards, order rules, `AuthService` (login, refresh rotation, reuse detection, logout) and `OrdersService` status updates, including the compare-and-set that prevents concurrent transitions.
- **Integration (Jest + Supertest against PostgreSQL from Docker Compose):** the full application with the runtime role. Suites cover cross-tenant isolation over HTTP, request manipulation and forged tokens, role enforcement, cookie attributes, refresh rotation and reuse detection, and RLS using raw connections that bypass the application layer.
- **End-to-end (Playwright):** a small number of browser flows against the running stack, including the tenant-isolation scenario.

## Alternatives considered

- **Testcontainers per suite:** isolated, but slower and needs Docker access from the test process; the Compose database is simpler and shared with local development.
- **SQLite or pg-mem:** fast, but no real RLS semantics.
- **Many end-to-end tests:** high confidence but slow and brittle; reserved for a couple of critical journeys.

## Consequences

- Integration tests require the database to be migrated and seeded (`npm run db:migrate && npm run db:seed`).
- Tests rely on the seeded tenants and users but not on a pristine database: they create uniquely named records, which accumulate between runs. `npm run db:seed:reset` restores the initial state.
- Concurrency properties are tested at the unit level, where the interleaving can be controlled; an HTTP-level race test would pass or fail depending on timing.
- The RLS suite fails if a policy is removed, which was checked by disabling RLS on a table.

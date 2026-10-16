# ADR 0008: PostgreSQL Row-Level Security as the last barrier

Status: Accepted

## Context
Application-level scoping can be bypassed by a bug, a raw query, a new code path or a missing filter. The database should refuse to return or modify another tenant's rows regardless of what the application sends.

## Decision
- Enable and `FORCE` Row-Level Security on every tenant-owned table (`users`, `products`, `orders`, `order_items`, `refresh_tokens`). One policy per table, for `USING` and `WITH CHECK`: `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`.
- The setting is absent or empty outside a tenant transaction, so the comparison yields NULL and no rows are visible or writable (fail-closed). `nullif` handles the empty string PostgreSQL returns for a setting that was set earlier in the session.
- Three roles: `app_owner` owns the schema and runs migrations and seed; `app_runtime` is used by the API, is not a superuser and has `NOBYPASSRLS`; `app_auth` owns only the lookup functions (ADR 0009). `FORCE` makes the policies apply to the owner as well.
- `app_runtime` gets DML grants only, and read-only access to `tenants` and `users`.
- Composite foreign keys complement the policies by preventing cross-tenant references.

## Alternatives considered
- **Application filtering only:** simplest, but a single missed filter becomes a data breach.
- **Views per tenant or schema per tenant:** stronger separation but more objects to manage (see ADR 0004).
- **Using the owner role at runtime:** without `FORCE`, owners bypass RLS silently.

## Consequences
- Isolation holds even for raw SQL issued through the application connection; integration tests prove it using the runtime role directly.
- Every query must run inside a tenant transaction, or it sees nothing.
- Policies add a small planning and execution overhead; the leading `tenant_id` indexes keep it negligible.
- Superusers and roles with `BYPASSRLS` ignore RLS, so production credentials must never use them for the API.

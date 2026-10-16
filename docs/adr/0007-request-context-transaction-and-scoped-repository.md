# ADR 0007: AsyncLocalStorage context, one transaction per request, scoped repositories

Status: Accepted

## Context

Application-level isolation must not rely on each query remembering a `WHERE tenant_id = ?`. The tenant must be available anywhere in the call chain without threading it through every function, and non-HTTP callers (jobs, command-line tasks, future tool or MCP servers) need the same guarantee.

## Decision

- `TenantContext` wraps `AsyncLocalStorage` and holds the tenant id, the identity and the `EntityManager` of the current transaction.
- `TenantRunner.runInTenantContext(tenantId, fn)` is the only way to enter a tenant context: it opens a transaction, runs `SELECT set_config('app.tenant_id', $1, true)`, binds the context and commits or rolls back. The HTTP `TenantTransactionInterceptor` delegates to it, so HTTP and non-HTTP code share one path.
- `TenantRepository` is the base class for tenant-owned data. Reads merge the context tenant into the filter (applied last, so callers cannot override it), inserts stamp it, updates never rewrite it, and use outside a context throws.

## Alternatives considered

- **Request-scoped providers carrying the tenant:** idiomatic in Nest but creates a provider tree per request and does not extend to non-HTTP code.
- **ORM-level global filters or subscribers:** hide the rule in configuration, but are easy to bypass with query builders and raw SQL.
- **Passing `tenantId` explicitly everywhere:** simple and explicit, but any omission silently leaks data.

## Consequences

- Every authenticated request runs in a transaction, which also gives atomic handlers.
- Because the setting is transaction-local (`is_local = true`), a pooled connection never leaks a tenant to the next borrower.
- Raw queries through the context manager are still subject to RLS (ADR 0008).
- Long-running handlers hold a transaction open; streaming endpoints would need a different approach.

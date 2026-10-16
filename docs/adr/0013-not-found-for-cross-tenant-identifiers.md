# ADR 0013: 404 instead of 403 for resources of other tenants

Status: Accepted

## Context

Returning `403 Forbidden` for an identifier that exists in another tenant confirms that the identifier is valid, which discloses information across the tenant boundary.

## Decision

Resources outside the caller's tenant are indistinguishable from nonexistent ones: reads, updates and deletes return `404`. Creating an order that references another tenant's product returns `422` with the same message used for unknown or inactive products. `403` is reserved for role violations inside the caller's own tenant.

## Alternatives considered

- **403 for foreign resources:** more explicit for debugging, but leaks existence.
- **Soft hints in error messages:** same leak.

## Consequences

- Data access naturally produces this behaviour, since scoped queries simply find nothing.
- Debugging cross-tenant mistakes relies on logs rather than API responses.

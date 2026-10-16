# ADR 0004: Shared database and schema with a tenant_id column

Status: Accepted

## Context
Tenants are restaurants. Each has a modest data volume, tenants are onboarded frequently and all share the same application version. The isolation strategy determines operational cost and the shape of every query.

## Decision
Use one database and one schema. Every tenant-owned table has a `tenant_id uuid NOT NULL` column, indexed with the tenant as the leading column. Composite foreign keys `(tenant_id, id)` ensure a row can only reference rows of the same tenant. Isolation is enforced in the application (ADR 0007) and in the database (ADR 0008).

## Alternatives considered
- **Schema per tenant:** stronger logical separation and per-tenant backup, but migrations must run N times, connection and catalog overhead grows with tenant count, and cross-tenant reporting is harder.
- **Database per tenant:** strongest isolation and noisy-neighbour control; highest operational cost, suited to few, large or regulated tenants.

## Consequences
- Cheapest to operate and migrate; a single migration applies to all tenants.
- Isolation depends on discipline in queries, which is why it is enforced centrally and backed by RLS.
- A tenant can be moved to a dedicated database later by filtering on `tenant_id`.
- Noisy-neighbour effects are possible and must be handled with rate limiting and quotas (not implemented here).

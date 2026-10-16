# ADR 0003: TypeORM for data access, plain SQL for migrations

Status: Accepted

## Context
Tenant isolation relies on a transaction-local PostgreSQL setting (`app.tenant_id`) that must be set on the same connection that runs the queries. The data layer therefore needs explicit control over transactions and the entity manager. Schema management must express Row-Level Security, roles, grants and `SECURITY DEFINER` functions, which ORMs do not model.

## Decision
- Use TypeORM for runtime data access, with an `EntityManager` bound to the request transaction and stored in the tenant context.
- Write migrations as ordered plain SQL files applied by a small runner that connects as the schema owner and records applied files in `schema_migrations`.
- Disable schema synchronization.

## Alternatives considered
- **Prisma:** strong typing and tooling, but its connection management makes pinning a per-request transaction with session settings awkward, and RLS is handled outside its schema language.
- **MikroORM:** good unit-of-work and filter support, but a smaller ecosystem in Nest and comparable RLS limitations.
- **Kysely or raw `pg`:** maximum control and very explicit SQL, at the cost of writing mapping and repository plumbing that Nest/TypeORM already provides.
- **TypeORM migrations:** workable, but SQL files are clearer for DDL that the ORM cannot generate.

## Consequences
- The tenant-aware repository base class is a thin layer over TypeORM repositories.
- Entities and SQL schema are maintained by hand and must be kept in sync; integration tests exercise both.
- Migration files are reviewable as plain SQL.

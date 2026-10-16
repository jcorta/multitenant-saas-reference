# ADR 0002: Modular monolith with an isolated AuthModule

Status: Accepted

## Context
Authentication (credentials, token issuing, refresh rotation) is a distinct concern from the restaurant domain and a likely candidate for extraction or replacement by an identity provider. The system is small, has one team and one deployable.

## Decision
Build a modular monolith. `AuthModule` is a separate Nest module with a narrow public surface: `JwtAuthGuard`, `RolesGuard`, `TokenService` and the `AuthenticatedUser` type. Domain modules (products, orders) depend only on that surface and never on users, credentials or refresh tokens directly. Access tokens are RS256 JWTs so any consumer can verify them with the public key alone.

Extraction path:
1. Publish the public key through a JWKS endpoint and have consumers verify against it.
2. Move `AuthModule`, the `users` and `refresh_tokens` tables and the two lookup functions into their own service, or replace them with an external identity provider (for example Keycloak, Auth0 or Cognito) that issues tokens carrying the same `sub`, `tenant_id` and `role` claims.
3. Keep `JwtAuthGuard` in the API unchanged; only the key source changes.

## Alternatives considered
- **Separate auth service now:** adds a network hop, a second deployable, distributed failure modes and cross-service transactions for no current benefit.
- **Auth logic spread across feature modules:** cheapest today, but makes later extraction a rewrite.

## Consequences
- One deployment, one database, in-process calls.
- Auth data lives in the same database and is protected by the same RLS policies as other tenant data.
- The module boundary is enforced by convention and code review, not by the runtime; a lint rule on imports can harden it.

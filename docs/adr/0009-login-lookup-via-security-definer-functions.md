# ADR 0009: Pre-tenant lookups through SECURITY DEFINER functions

Status: Accepted

## Context

Login and token refresh must find a user or a refresh token before the tenant is known, but RLS hides every row without a tenant setting. The tenant cannot be taken from the client (ADR 0005).

## Decision

Two narrow functions, `auth_find_user_by_email(email)` and `auth_find_refresh_token(token_hash)`, run as `SECURITY DEFINER` with a pinned `search_path`. They are owned by a dedicated `app_auth` role that has `BYPASSRLS` but only `SELECT` on `users` and `refresh_tokens`. `EXECUTE` is revoked from `PUBLIC` and granted to `app_runtime`. Each function looks up one exact key and returns at most one row.

After the lookup, the tenant id from the returned row is used to enter a tenant context, and every subsequent read and write (marking a token used, revoking a family, inserting the next token) is subject to RLS as usual. Email addresses are globally unique so a login identifies exactly one tenant.

A dedicated role is used because the table owner is also subject to `FORCE ROW LEVEL SECURITY`; a function owned by it would see no rows.

## Alternatives considered

- **Login scoped by tenant slug:** avoids the bypass but makes the client name a tenant before authenticating; users must know it.
- **Policy exception for a lookup setting:** weakens the policy for all queries and is easier to misuse.
- **Connecting as a BYPASSRLS role for auth queries:** larger blast radius than two single-key functions.

## Consequences

- Email enumeration is only possible through the login endpoint, which answers identically for unknown email and wrong password.
- The bypass surface is two small, reviewable functions covered by tests.
- Email uniqueness is global; the same address cannot belong to two restaurants.

# Security

This repository is a reference implementation. Its configuration (default passwords, locally generated keys, `Secure` cookies over plain HTTP on `localhost`) is intended for local development only.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's "Report a vulnerability" feature on this repository rather than opening a public issue. Include the affected component, steps to reproduce and the impact you observed.

## Security model

Tenant isolation is enforced in two independent layers, described in [ADR 0007](docs/adr/0007-request-context-transaction-and-scoped-repository.md) and [ADR 0008](docs/adr/0008-postgresql-row-level-security.md). Authentication and session handling are described in [ADR 0006](docs/adr/0006-jwt-access-and-rotating-refresh-tokens.md) and [ADR 0011](docs/adr/0011-httponly-cookies-set-by-the-api.md).

## Known limitations

- **No rate limiting.** Login and refresh endpoints are not throttled, so password guessing is limited only by argon2 cost.
- **No key rotation.** A single RS256 key pair is used, without a `kid` header or JWKS endpoint.
- **Trusted callers of `runInTenantContext`.** The helper validates the identifier format but not the caller's right to act as that tenant; non-HTTP callers must obtain the tenant from a trusted source.
- **Global email uniqueness.** An email address can belong to only one tenant.
- **Access-token lifetime.** Revoking a session stops refreshes immediately, but an issued access token remains valid for up to 15 minutes.
- **Shared-schema model.** A noisy tenant can affect others; there are no quotas.

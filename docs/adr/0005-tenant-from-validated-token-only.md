# ADR 0005: The tenant is taken only from the validated token

Status: Accepted

## Context

If the effective tenant can be influenced by the caller, through a header, query parameter or body field, any client can attempt to read another tenant's data. Isolation must not depend on client honesty.

## Decision

The tenant identifier comes exclusively from the `tenant_id` claim of a verified access token. The guard attaches it to the request, and the tenant transaction interceptor passes it to `runInTenantContext`. Client-supplied tenant information is never read:

- Request bodies and query strings go through a validation pipe with `whitelist` and `forbidNonWhitelisted`, so a `tenantId` field yields `400`.
- Tenant headers are ignored.
- The refresh flow derives the tenant from the stored refresh-token row, not from the request.
- Cross-tenant resource identifiers return `404`, not `403`, so existence is not disclosed.

## Alternatives considered

- **Tenant header or subdomain selected by the client:** convenient for APIs and testing, but requires a separate proof that the caller belongs to that tenant on every request.
- **Tenant in the URL path:** same issue, plus every route needs to validate it.

## Consequences

- A user belongs to exactly one tenant; multi-tenant users would require a tenant-selection step that issues a new token.
- Tests forge tokens (wrong key, HS256 with the public key, `alg: none`, swapped claims) to prove the claim cannot be altered.

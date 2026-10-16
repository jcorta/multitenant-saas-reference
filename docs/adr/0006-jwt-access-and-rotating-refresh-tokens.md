# ADR 0006: RS256 access tokens and rotating opaque refresh tokens

Status: Accepted

## Context
Users must stay signed in while active without long-lived bearer credentials. Tokens must be verifiable by other components without sharing a secret, and a leaked refresh token must be detectable.

## Decision
**Access token:** JWT signed with RS256, 15-minute lifetime, claims limited to `sub`, `tenant_id`, `role`, `iss`, `aud`, `iat`, `exp`. The verifier pins the algorithm, issuer and audience. The private key is only available to the API; the public key is sufficient to verify.

**Refresh token:** opaque 256-bit random value, 7-day lifetime, stored only as a SHA-256 hash in `refresh_tokens`. Every use rotates it: the presented token is marked used with a compare-and-set update and a new token in the same `family_id` is issued. Presenting an already-used token revokes the whole family, ending the session for both the attacker and the legitimate holder. Logout revokes the family.

## Alternatives considered
- **Long-lived access token:** no refresh machinery, but a stolen token is valid for its whole lifetime and cannot be revoked.
- **Refresh token as a JWT:** self-contained, but revocation and reuse detection need server state anyway.
- **HS256:** simpler, but every verifier would need the signing secret.
- **Sliding sessions with server-side session ids:** simple revocation, but every request needs a lookup and tokens are not verifiable by other services.

## Consequences
- Revocation is effective within one access-token lifetime.
- Two tabs refreshing at the same moment would look like reuse; the web client serializes refreshes to avoid this.
- Clients that lose the response of a rotation (network failure) must sign in again.
- Key rotation, a `kid` header and a JWKS endpoint are the natural next steps (see ADR 0002).

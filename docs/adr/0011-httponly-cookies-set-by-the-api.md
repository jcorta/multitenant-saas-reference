# ADR 0011: Tokens in httpOnly cookies set directly by the API

Status: Accepted

## Context

Tokens stored where page scripts can read them (localStorage, JavaScript-visible cookies) are exposed to theft through XSS. The browser client should never be able to read a credential.

## Decision

The API sets both tokens as cookies that scripts cannot read: `HttpOnly; Secure; SameSite=Strict`.

- Access cookie: `Path=/api`, 15 minutes.
- Refresh cookie: `Path=/api/auth`, 7 days. It is never sent with data requests; it reaches only `POST /auth/refresh` and `POST /auth/logout` (logout needs it to revoke the session server-side).
- Login responses carry no token in the body.
- The web client calls the API directly with `credentials: 'include'`, refreshes once on a `401` and retries.
- CORS allows only the configured web origin with credentials.
- CSRF defense in depth on top of `SameSite=Strict`: state-changing requests must carry a custom `X-Requested-With` header (which cross-site forms cannot set) and, when the browser sends an `Origin`, it must match the web origin.

Web and API are served from the same site (`localhost` on different ports, or sibling subdomains in production), which is what makes `SameSite=Strict` workable.

### Alternative considered: Nuxt as a backend-for-frontend (BFF)

Nuxt server routes would hold the tokens (session cookie or server-side store) and proxy calls to the API, so the browser would only talk to Nuxt.

Not chosen because:

- It adds a second hop and a second session layer to secure, monitor and scale, duplicating what the API already does.
- It couples the API's authentication to one frontend, whereas the API is meant to be consumed by other clients too.
- Non-browser clients would still need a separate token path.
- The cookie approach already keeps tokens away from JavaScript, which is the main property a BFF would add here.

A BFF becomes attractive when several frontends or third-party identity providers are involved, when tokens must not reach the browser at all (including as cookies the browser sends to the API origin), or when the API must stay off the public internet.

### Browser note

`Secure` cookies on `http://localhost` work in Chromium-based browsers and Firefox, but may not in Safari. Use Chromium or Firefox for local development, or serve over HTTPS.

## Consequences

- XSS cannot exfiltrate tokens, though it can still issue authenticated requests while the page is open.
- Cookie scoping and CSRF protections must be kept in sync with deployment topology (same-site requirement).
- Non-browser clients can use `Authorization: Bearer` with an access token.

# ADR 0001: npm workspaces monorepo

Status: Accepted

## Context

The system has a NestJS API, a Nuxt web client and an end-to-end test package that evolve together and share conventions (Node version, linting, environment files). Contributors should be able to run everything with one install.

## Decision

Use a single repository with npm workspaces: `apps/api`, `apps/web` and `e2e`. Root scripts orchestrate common tasks (`db:migrate`, `test`, `test:integration`, `test:e2e`).

## Alternatives considered

- **Separate repositories:** isolates release cycles but makes cross-cutting changes (API contract plus UI) harder to review and test together.
- **pnpm/Nx/Turborepo:** better caching and task graphs at scale, but extra tooling that the current size does not justify.

## Consequences

- One lockfile and one `npm ci` for the whole project.
- Docker builds copy the root manifests and use `--workspace` to install only what each image needs.
- No build caching across packages; revisit if the number of packages grows.

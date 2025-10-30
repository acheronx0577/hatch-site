# CODEBASE_SUMMARY

> Generated artifact placeholder. Run `pnpm run tools:codebase` to refresh using the automated script.

- Monorepo packages: apps/api (NestJS), apps/web (Next.js), packages/* shared libraries.
- Language mix (approximate): TypeScript dominates, with supporting SQL/Prisma schema and Markdown docs.
- Key service directories:
  - `apps/api/src/modules` — feature modules for contacts, pipelines, messaging, etc.
  - `apps/api/src/platform` — platform foundations (auth, tenancy, RBAC/FLS, audit).
  - `packages/db/prisma` — Prisma data model and migrations.
  - `docs/` — product requirements, ADRs, governance.

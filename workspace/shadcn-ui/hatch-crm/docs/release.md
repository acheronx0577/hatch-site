# Release Management & GA Readiness

This checklist codifies the S10 hardening plan. Treat it as the source of truth before tagging `v1.0.0-beta` or GA.

## Gates & Automated Guards

- **Spec drift** — `spec-nightly.yml` regenerates the lite spec; drift on `main` now fails the nightly (PRs still emit warnings). `spec:verify` remains a required check in CI.
- **Schema drift** — `schema-drift.yml` runs `prisma migrate diff --from-migrations --to-schema-datamodel` to ensure no Prisma schema change ships without a migration.
- **Full matrix** — `pnpm run full-matrix` remains the blocking CI job (API unit/integration, Vitest shards, Playwright smokes, SDK smoke).

## Release Checklist

1. `pnpm install` (workspace root) — ensure lockfile matches.
2. `pnpm run spec:all` — regenerates openapi + SDK smoke.
3. `pnpm run spec:verify` — sanity check committed specs.
4. `pnpm --filter @hatch/db exec prisma migrate diff --from-migrations packages/db/prisma/migrations --to-schema-datamodel packages/db/prisma/schema.prisma --exit-code`
5. `RUN_E2E_TESTS=true pnpm run full-matrix`
6. Update `CHANGELOG.md` (or release notes section) and bump SDK versions as needed.
7. Commit regenerated assets (OpenAPI, SDK) and tag:
   - `git tag -a v1.0.0-beta -m "Hatch CRM beta"`
   - `git push origin main --tags`

## Release Notes Template

```markdown
## 🚀 Hatch CRM vX.Y.Z

### Added
- …

### Changed
- …

### Fixed
- …

### SDK
- Regenerated from `openapi/openapi.lite.json`; published `packages/sdk-lite@X.Y.Z`.

### Ops
- Spec drift gate on `main`; full matrix green on migrated DB.
```

## Label & Changelog Policy

- PRs with breaking behaviour must include the `breaking:` label and update the release notes section (or CHANGELOG) prior to merge.
- Feature PRs should mention whether schema or spec regeneration is required so reviewers can double-check drift workflows.

## Rollback & Backups

- Keep PITR/hourly backups enabled for production Postgres. Validate at least once per milestone by restoring to a staging DB and pointing the API at read-only creds.
- Rollback playbook outline:
  1. `git checkout <previous-tag>`
  2. `pnpm install --frozen-lockfile`
  3. `pnpm --filter @hatch/db exec prisma migrate status` (ensure no pending migrations)
  4. Redeploy API/Web + re-run `spec:verify`
  5. Use feature flags to disable risky flows (file uploads, background jobs) while traffic drains.

## Observability Expectations

- Request tracing (OTEL) and `/metrics` must be up; dashboards should include:
  - request throughput & p95 latency
  - 4xx/5xx error budgets
  - job workers (outbox, reporting) health
- Logs contain `requestId`, `orgId`, `userId`, and `durationMs` for every request. Use the request id to stitch traces ↔ logs ↔ metrics when debugging.

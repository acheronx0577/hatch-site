# v1 Prep Sequence (Post-S7)

## 1. Consolidate Migrations & Seeds
- Sweep every outstanding `// TODO(migrate)` (OrgCommissionPlan, MetricsDaily/Run, RE linkages/snapshots, Rules, Case, Files pagination).  
- Ship a single migration pass that normalizes those schemas.  
- Apply migrations locally, seed a baseline org + sample data, and capture repeatable seed scripts.

## 2. Enable Full Test Matrix on Migrated DB
- Run unit, integration, Playwright, and SDK smoke suites against the migrated database.  
- Fix regressions that surface with real relations and refresh fixtures accordingly.  
- Ensure CI bootstraps the migrated schema quickly; document the bootstrap commands.

## 3. Optional: Adopt Generated SDK in Web
- Replace bespoke fetchers module-by-module (Accounts, Opportunities, Cases, Contacts, Leads first).  
- Maintain behavior while swapping to the generated SDK; log follow-up tickets for any gaps uncovered.  
- Keep installs `--ignore-scripts` so Prisma postinstall stays out of the hot path.

## 4. S8 — Global Search UX
- Backend: deliver aggregated `/search` with `q`, `types[]`, filters, `limit`, and cursor; enforce RBAC/FLS.  
- Web: build the search page with facets, highlighting, and open-record actions.  
- Acceptance: responses return `{ items, nextCursor }`, spec updated, append smokes validate result growth.

## Follow-On Slices
- **S9 — Admin Layouts & Record Types:** introduce UI metadata for field visibility/order, admin editor, and runtime enforcement aligned with current platform scope.  
- **S10 — GA Preparation:** finalize docs, keep OpenAPI/SDK drift checks green in CI, add telemetry/audit viewer, and tag `v1.0-beta` once the full matrix is consistently green.

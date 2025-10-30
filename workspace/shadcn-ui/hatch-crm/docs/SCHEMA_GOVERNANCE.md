# Schema Governance Policy

## Objectives

- Keep the shared data model stable while enabling rapid iteration.
- Guarantee that every schema change is auditable, reversible, and covered by tests.
- Protect production data through rigorous review and automated drift detection.

## Change Requirements

1. **Migration Pairing**  
   - Every change must ship with forward and backward migrations.  
   - SQL snapshots (`docs/DB_SCHEMA_SNAPSHOT.sql`) must be regenerated.

2. **Design Traceability**  
   - Reference an ADR or create a new one for each change.  
   - Outline rationale, impact, and rollout strategy.

3. **Testing**  
   - Unit or integration tests must touch at least one CRUD path using new schema elements.  
   - Failing to cover new fields or tables blocks merge.

4. **Performance Notes**  
   - Document index decisions and cardinality expectations in the migration file comments.

5. **Review Process**  
   - Code owners for `packages/db`, `infra/migrations`, and `openapi` must approve.  
   - Destructive operations require an explicit `--allow-destructive` flag acknowledged in the PR.

## Automation & CI

- Migration drift check compares generated Prisma schema with the live DB snapshot.  
- OpenAPI drift check ensures routes match the spec after schema updates.  
- Coverage threshold: ≥ 80% lines for services affected by the schema change.

## Rollout & Backfill

- Provide data backfill scripts or seed updates where required.  
- Use feature flags or background jobs for long-running backfills; document runbooks.

## Incident Response

- If a migration fails in production:
  - Roll back using the paired down migration.  
  - Capture a post-mortem ADR summarising root cause and preventive actions.  
  - Update this document if governance rules need adjustment.

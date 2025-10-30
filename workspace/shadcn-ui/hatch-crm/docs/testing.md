# Testing Strategy

## Unit Tests

- **Consent Enforcement** (`packages/shared/src/__tests__/consent.spec.ts`) — verifies quiet-hours, STOP, and 10DLC guardrails for each channel/scope combination.
- **Routing Scoring** (`packages/shared/src/__tests__/routing.spec.ts`) — ensures high-scoring agents are selected, low-score fallbacks drop to team pond, and weights affect outcomes.
- **MLS Pre-flight** (`packages/shared/src/__tests__/mls.spec.ts`) — validates disclaimer/compensation rule enforcement and pass/fail response payloads.
- **Rules Expression Engine** (`apps/api/test/unit/rules.engine.spec.ts`) — exercises DSL evaluation helpers (`in`, `contains`, `changed`, error handling).
- **Layouts Service** (`apps/api/test/unit/layouts.service.spec.ts`) — asserts manifest precedence (profile → record type → default) and verifies FLS intersection removes hidden columns even when layouts enable them.
- **OpenAPI Routes** (`apps/api/test/unit/openapi.routes.spec.ts`) — generates the in-memory Swagger document and asserts key paths are registered (does not touch the filesystem).
- **Search Highlight & Facets** (`apps/api/test/unit/search.service.spec.ts`) — verifies snippet highlighting and facet aggregation on the global search service.

Run via `pnpm --filter @hatch/shared test`.

### S7a – OpenAPI Lite / SDK

- Spec generation: `pnpm run spec:gen:lite` (boots DocsAppModule with docs stubs, writes `openapi/openapi.lite.json`).
- SDK generation: `pnpm exec ts-node scripts/sdk/generate-sdk-lite.ts` (consumes the lite spec, writes sources to `packages/sdk-lite/`).
- Optional smoke: add `apps/api/test/unit/openapi.lite.spec.ts` to exercise the docs module purely in-memory; no filesystem writes required.
- Optional SDK compile check: add `packages/sdk-lite/test/sdk-lite.spec.ts` to ensure the generated APIs type-check when imported.

**Spec & SDK sync:** Any change to controllers or DTOs requires:

```bash
pnpm run spec:all
```

This regenerates the OpenAPI lite spec (with docs stubs), runs smoke checks, verifies both output paths, and executes the SDK smoke.

> Node 22 currently prints `MODULE_TYPELESS_PACKAGE_JSON` warnings when these scripts run; they are benign and stem from Node re-parsing TypeScript entrypoints.

## API Tests

`apps/api/test/app.e2e-spec.ts` boots the Nest app (Fastify adapter) and uses Supertest to cover:

1. Create contact → 201 with ID.
2. Send SMS without consent → 403 with descriptive reason.
3. Capture SMS consent → retry send → 201 success.
4. Request tour without BBA → 409 buyer-rep required payload.
5. Draft + sign BBA → re-request tour → confirmed with assignment.
6. MLS pre-flight → failure (missing disclaimer) then pass (disclaimer provided).

Execute with `pnpm --filter @hatch/api test`.

- Additional integration stubs guarded by `RUN_INTEGRATION_TESTS=true` live under `apps/api/test/integration/`. Current coverage seeds the lifecycle for Accounts (`accounts.crud.spec.ts`) and Opportunities (`opportunities.crud.spec.ts`), asserting controller wiring/FLS/audit pathways once Prisma migrations are applied.
- Audit log list (`admin.audit.spec.ts`) seeds a couple of events, exercises `/admin/audit` paging, and validates cursor + filter behaviour.
- Layout integration (`layouts.resolve.spec.ts`) persists an admin edit, resolves the manifest, and verifies the service returns list/detail variants with FLS-respected payloads.
- S6 adds rules middleware coverage: `rules.validation.spec.ts` (400s when validation rules trigger) and `rules.assignment.spec.ts` (auto-owner assignment). Enable with `RUN_INTEGRATION_TESTS=true`.
- S2 coverage adds `deal-desk.flow.spec.ts` and `payouts.generate.spec.ts`, validating approvals and payout math once migrations/seed data are applied.
- S3 covers the reporting pipeline (`reporting.spec.ts`) to recompute metrics across lead conversion, deliverability, CC risk, and pipeline value — gated by `RUN_INTEGRATION_TESTS=true`.
- S4 adds real-estate flow coverage (`re.offer-to-payout.spec.ts`, `re.milestones.spec.ts`) to exercise offers → transactions → payouts and milestone audit events. Enable with `RUN_INTEGRATION_TESTS=true`.
- S8 adds a search endpoint smoke (`search.spec.ts`) to validate `{ items, nextCursor, facets }` on `GET /search`. Enable with `RUN_INTEGRATION_TESTS=true`.

## Frontend & E2E

- Component coverage leverages domain unit tests; UI interaction smoke tests can be added with Playwright (recommended targets: consent capture → send SMS flow, tour booking w/ BBA gate, MLS pre-flight swap).
- Initial Playwright placeholder (`apps/web/tests/accounts.view.spec.ts`) is skipped unless `RUN_E2E_TESTS=true` is provided, ensuring CI stays green until the dev server hook-up lands. A payouts navigation smoke test (`apps/web/tests/payouts.view.spec.ts`) follows the same gating.
- Dashboard reporting smoke (`apps/web/tests/dashboard.metrics.spec.ts`) confirms the new widgets mount; enable with `RUN_E2E_TESTS=true`.
- S4 UI stubs (`apps/web/tests/re.offers-ui.spec.ts`, `apps/web/tests/re.transaction-ui.spec.ts`) require `RUN_E2E_TESTS=true` plus `RE_TEST_LISTING_ID`/`RE_TEST_TRANSACTION_ID` to point at seeded records.
- S6 admin UI smoke (`apps/web/tests/admin.rules.spec.ts`) opens the JSON editor modal; gated by `RUN_E2E_TESTS=true`.
- S8 global search smoke (`apps/web/tests/search.page.spec.ts`) validates the `/search` page appends results via `Load more`; gated by `RUN_E2E_TESTS=true`.
- S9 layout admin smoke (`apps/web/tests/admin.layouts.smoke.spec.ts`) hides the Contacts email column, verifies the change persists, and confirms `/contacts` renders the updated manifest (`RUN_E2E_TESTS=true`).
- S10 audit viewer smoke (`apps/web/tests/admin.audit.smoke.spec.ts`) ensures the `/admin/audit` page loads, filters, and continues to render results under the e2e env (`RUN_E2E_TESTS=true`).
- SDK smoke (`packages/sdk/test/sdk.smoke.spec.ts`) validates the generated API surface; gated by `RUN_SDK_TESTS=true`.
- Suggested workflow:
  1. `pnpm exec playwright install` (once).
  2. Run `RUN_E2E_TESTS=true pnpm exec playwright test` once the Next.js dev server is scripted.

### Web Pagination & Error Standards (S7b.2)

- All list helpers return `{ items, nextCursor }` and accept an optional `AbortSignal` so rapid filter/search changes cancel stale requests.
- Pages and components use `useCursorPager` with the shared `LoadMoreButton`, dedupe by `id` on append, and clear `nextCursor` when filters reset the results to page 1.
- API failures are normalised through `useApiError` and rendered with `ErrorBanner`; ad-hoc `err instanceof Error` checks are discouraged in web UI.
- Empty states follow consistent copy (“No … yet.”) and render only when the pager is idle and `items.length === 0`.

## CI Pipeline (Blueprint)

1. Install dependencies (`pnpm install`).
2. Spin up PostgreSQL/Redis services (Docker service containers).
3. `pnpm --filter @hatch/db migrate` + `pnpm --filter @hatch/db seed`.
4. `pnpm lint` (`turbo run lint`).
5. `pnpm test` (`turbo run test`).
6. `pnpm build` (`turbo run build`).
7. Publish artifacts: Next standalone output, Nest compiled dist, OpenAPI spec (`/docs` endpoint on API).

## Coverage Gaps & Next Steps

- Add dedicated tests for event outbox retry policy and webhook signing.
- Implement Playwright suite exercising login stub → contact 360 → consent capture → messaging.
- Add contract tests for routing assignments (mocking agent snapshots vs Prisma queries).
- Expand compliance logging assertions (Activity records, Deliverability metrics) once audit workflows mature.
- S5 cases coverage (`apps/api/test/integration/cases.crud.spec.ts`) gated by `RUN_INTEGRATION_TESTS=true`.
- S5 cases UI smoke (`apps/web/tests/cases.view.spec.ts`) gated by `RUN_E2E_TESTS=true`.

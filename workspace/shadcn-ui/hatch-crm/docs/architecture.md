# Architecture Overview

## Monorepo Layout

- `apps/api` — NestJS + Fastify service exposing REST API with OpenAPI metadata, Prisma data access, and integration with the event outbox.
- `apps/web` — Next.js (App Router) frontend delivering broker dashboards, contact 360, consent-aware messaging, tour booking, and compliance tooling.
- `packages/db` — Prisma schema, migrations, and seed data for the PostgreSQL datastore, including tenants, contacts, consent ledger, MLS profiles, routing metadata, and webhook definitions.
- `packages/shared` — Domain logic shared across services (consent enforcement, routing engine, MLS guardrails, journey simulation, event envelopes).
- `packages/config` — Runtime configuration helpers (reserved for future secrets/typed env parsing).
- `infra/docker` — Local runtime dependencies (PostgreSQL, Redis, MinIO S3-compatible storage, Mailhog SMTP capture).
- `docs` — Operational documentation, compliance guardrails, testing strategy, and runbooks.

## Backend Service

The Nest application composes feature-focused modules:

- `ContactsModule` — CRUD for contacts, timeline hydration, timeline summaries, and outbox emission of `lead.created` events.
- `AccountsModule` — Salesforce-style account management with FLS-aware CRUD, file attachments, and opportunity rollups.
- `ConsentsModule` — Consent ledger capture/revoke with global channel blocks and audit activity + `consent.captured / consent.revoked` events.
- `OpportunitiesModule` — Core pipeline object covering stage management, forecast attributes, and account linking.
- `MessagesModule` — Email/SMS/voice (simulated) dispatch with consent enforcement, quiet hour checks, 10DLC guard, deliverability metrics, and inbound webhook normalization.
- `FilesModule` — Polymorphic file registration, signed upload URL handoff, and attachment linking across objects.
- `ToursModule` — Buyer-rep gate enforcement, capacity-aware routing integration, tour state transitions, and event emission.
- `AgreementsModule` — Buyer-rep/listing agreement lifecycle with override logging and `agreement.signed` events.
- `RoutingModule` — Capacity/performance/geography/consent-aware scoring using the shared routing engine, persisting assignment reasons for audit.
- `MlsModule` — Publishing pre-flight checks, Clear Cooperation timers, and compliance alerting.
- `DashboardsModule` — Broker KPIs (conversion, tour coverage, deliverability, deal forecast vs actual, Clear Cooperation risks).
- `JourneysModule` — Rule-engine simulation endpoint for Journeys/Playbooks.
- `WebhooksModule` + `OutboxModule` — Outbox persistence, webhook delivery with HMAC signature, retries, and manual flush controls.
- `ListingsModule` — Minimal listing catalogue endpoint for the Tour Booker UI.
- `DealDeskModule` — Captures discount approval requests, manages lifecycle decisions, and emits outbox events for workflow automation.
- `CommissionPlansModule` — Stores broker/agent split definitions and resolves payout math for opportunities.
- `PayoutsModule` — Generates payable rows from commission computations and tracks disbursement status.

Cross-cutting services include `ComplianceService` (consent/quiet-hour enforcement), `PrismaService` (database access w/ lifecycle hooks), and shared event definitions.

## Rules Engine (Validation & Assignment)

- Prisma models `ValidationRule` and `AssignmentRule` store org-scoped JSON DSL definitions (append-only schema; seeded via `scripts/seed_rules_fixtures.ts`).
- `RulesModule` provides a pure evaluator plus Nest middleware that hydrates active rules before mutations on Accounts, Opportunities, Cases, and RE objects.
- Validation rules block writes with a `400` containing `[{ field, message }]` violations when the DSL’s conditions are met.
- Assignment rules emit deterministic owner/team overrides; middleware vets FLS writable sets before applying payload overrides.
- Admin API (`/admin/rules/validation|assignment`) plus the Next.js UI (`/admin/rules`) allow org admins to CRUD rules with basic JSON editing and server-side schema validation.

## Layout Engine (S9 Runtime Manifests)

- Prisma tables `RecordType`, `ObjectLayout`, and `FieldLayout` hold org-scoped manifests. Each layout is keyed by `{ orgId, object, kind, recordTypeId, profile }` so we can store list/detail variants per record type and optional profile override.
- `FIELD_MAP` in `packages/shared` provides the baseline manifest applied when no layout row exists; seeds (`scripts/run_seed_v1_baseline.js`) upsert the default record type and hydrate list/detail layouts for Accounts, Opportunities, Contacts, and Leads.
- `LayoutsService` resolves manifests by precedence: profile-specific layouts win, followed by record-type defaults, and finally the shared baseline. The service always intersects the manifest with FLS-visible fields so hidden columns never render even if enabled by an admin.
- Admin APIs (`/admin/layouts/upsert`, `/admin/layouts/resolve`) and the Next.js editor (`/admin/layouts`) persist layout changes and return the resolved manifest. Playwright smoke (`apps/web/tests/admin.layouts.smoke.spec.ts`) covers hiding a column and verifying it disappears from `/contacts` after save.
- Pipeline board cards reuse the resolved manifest: the board queries `resolveLayout({ kind: 'board' | 'list' })` and renders the top N fields while suppressing the footer owner when already present in the manifest.

## Operations & Observability

- The API boots with OpenTelemetry auto-instrumentation (`@opentelemetry/sdk-node` + OTLP exporter). Set `OTEL_EXPORTER_OTLP_ENDPOINT` to forward spans to your collector and `OTEL_SERVICE_NAME` to override the default (`hatch-crm-api`). Disable collection via `OTEL_DISABLED=true`.
- Structured logging uses Pino. Every request is wrapped with a generated `x-request-id` (or the incoming header) and the logger is enriched with `{ requestId, orgId, userId }`. Completion logs emit `request.completed` with method, route, status code, and `durationMs`.
- Prometheus metrics are exposed at `/metrics` (guarded by `METRICS_DISABLED=true`). Default metrics plus `hatch_crm_http_requests_total` and `hatch_crm_http_request_duration_seconds` buckets track 2xx/4xx/5xx throughput and latency (p50/p95/p99 downstream).
- Fastify hooks stamp the request id header, emit structured logs, and feed the Prometheus histogram/counter. The `/metrics` endpoint returns the shared registry so dashboards (Grafana, Datadog agent, etc.) can scrape directly.
- The telemetry starter registers graceful shutdown handlers so `SIGTERM`/`SIGINT` flush spans before exit; tests keep instrumentation disabled (NODE_ENV=test short-circuits `initTelemetry`).

## Global Search

- `SearchModule` exposes `GET /search` with query, type, owner/stage/status filters, pagination via `{ items, nextCursor }`, and lightweight facets (counts by type).
- The service performs org/tenant constrained lookups across Contacts/Leads (Person), Accounts, Opportunities, Cases, and RE Listings/Offers/Transactions; it defaults to Postgres FTS (`search_tsv`) when available and falls back to case-insensitive `ILIKE` scans.
- Results are deduped and ordered by a relevance heuristic (term matches + recency); cursors encode score/updatedAt/id to guarantee stable paging.
- Row-level security leverages existing object permissions + `CanService`, and FLS trims fields prior to shaping titles/snippets.
- The Next.js page (`/search`) renders a single search experience with facets, owner/stage/status filters, highlighted snippets, and `useCursorPager`-backed load more.

## API & SDK

- `DocsAppModule` (in `apps/api/src/docs/`) wires the public controllers/DTOs with stubbed deps so documentation can be generated without booting the production app.
- `scripts/generate-openapi-lite.ts` spins up that module with a Fastify adapter via `NestFactory.create`, skips binding a port, and writes `apps/openapi/openapi.lite.json` + `openapi/openapi.lite.json`.
- `scripts/generate-openapi.ts` performs the full-fidelity generation used for the complete spec, and `scripts/check-openapi-drift.sh` keeps the committed manifest in sync.
- SDKs: `scripts/sdk/generate-sdk-lite.ts` produces the fetch-based lite client under `packages/sdk-lite/`, while `scripts/sdk/generate-sdk.ts` emits the full workspace SDK (`packages/sdk/`).
- Tests gate the surfaces: API unit specs assert key paths on the in-memory Swagger doc; optional lite spec/SDK smokes validate the docs module and generated client compile without network calls.

## Frontend Application

The Next.js app renders the minimum surfaces to operate the agent day:

- `dashboard/` — Broker metrics, deliverability, Clear Cooperation panel.
- `people/` — Contact list with consent badges and detail view (timeline, unified inbox, quick consent-aware messaging).
- `accounts/` — Account list + 360 record view with related opportunities and attachments.
- `opportunities/` — Pipeline list and record view with stage, amount, account link, and attachments.
- `deal-desk/requests/` — Minimal admin surface to review, approve, or reject deal desk submissions.
- `commission-plans/` — CRUD panel to manage broker/agent commission splits.
- `payouts/` — Read-only list with mark-paid action for generated disbursements.
- `tour-booker/` — Appointment-centric booking with automatic buyer-rep gate feedback.
- `agreements/buyer-rep/` — Broker-side wizard to draft & capture buyer-rep agreements.
- `mls/preflight/` — Publishing checklist enforcing MLS disclaimers and compensation display rules.
- `login/` and `magic-link/` — SSO and consumer magic link placeholders for flows outside the MVP scope.

All frontend data access is routed through `lib/api.ts`, which talks to the Nest API using the tenant context injected via `NEXT_PUBLIC_TENANT_ID`. Quick actions (consent capture, SMS send, tour booking, pre-flight) rely on client components to demonstrate interactive flows while back-end enforcement remains centralized.

## Data Flow & Eventing

1. **Lead creation** — `POST /contacts` persists people, optional consent evidence, generates activity, and queues `lead.created` in the outbox.
2. **Consent capture** — `POST /contacts/:id/consents` creates a ledger entry, clears STOP blocks, writes audit activity, and emits `consent.captured`.
3. **Messaging** — `POST /messages/sms|email` passes through `ComplianceService` (consent, quiet hours, 10DLC), persists messages, updates deliverability metrics, and emits `message.sent` or enforces `403` errors with logged violations.
4. **Tour booking** — `POST /tours` checks buyer-rep agreements, optionally raises a `409` with wizard route, otherwise creates tour, calls routing engine, assigns agents, logs activity, and emits `tour.requested`/`tour.confirmed`.
5. **Publishing** — `POST /mls/preflight` leverages shared MLS guardrails, logging violations and enabling UI feedback; Clear Cooperation timers raise `compliance.violation_detected` events.
6. **Outbox delivery** — Background (or manual) flush loads pending events, signs payloads via HMAC, and posts to active tenant webhooks with exponential backoff.

This architecture satisfies the event-driven, consent-first CRM requirements while remaining extensible for deeper automation, queue-backed workers, and richer UI iterations.

## Reporting

- `MetricsDaily` — daily aggregates for lead conversion, messaging deliverability, Clear Cooperation risk, and pipeline value snapshots.
- `MetricsRun` — execution log for recompute jobs, tracking status and notes per metric key.
- `AggregatorService` — stateless job that recomputes metric families for a date range, persisting idempotent upserts and recording run outcomes.
- `ReportingController` — exposes `GET /reporting/metrics` for time-series retrieval and `POST /reporting/recompute` to trigger ad-hoc aggregation, both guarded by RBAC/FLS.
- Dashboard widgets consume the reporting API to surface conversion, deliverability, risk, and pipeline summaries alongside existing operational tiles.

## Real-Estate Flows

- `Listing` ↔ `Opportunity` — accepted offers update listings and keep pipeline stages in sync via opportunity stage mapping.
- `Offer` lifecycle — submissions are stored with terms/contingencies, FLS-guarded decisions accept/reject offers, and acceptance provisions a `Deal` (transaction) record.
- `Offer` lifecycle — submissions are stored with terms/contingencies, FLS-guarded decisions accept/reject offers, and acceptance provisions a `Deal` (transaction) record. Acceptance runs inside a single Prisma transaction and is idempotent.
- `Deal` (transaction) — holds milestone checklist JSON, optional `commissionSnapshot`, and links back to listing/opportunity. Milestone updates emit `re.transaction.milestone.completed` events only on first completion to drive Journeys.
- Commission + payouts — transactions delegate to `CommissionPlansService` for preview math and trigger `PayoutsService` (or manual fallback) to create payout rows, emitting `re.payouts.generated`.
- Events produced across the flow (`re.offer.created`, `re.offer.accepted`, `re.listing.status.changed`, etc.) feed the existing Outbox/Journeys automation surface.
- Cases service adds Salesforce-style case management (CRUD, email intake stub, Files linkage).

## API & SDK (S7a)

- `apps/api/src/docs/docs-app.module.ts` registers the Accounts, Opportunities, Cases, Files, and Reporting controllers with lightweight stub providers so Swagger can build metadata without booting the production platform stack.
- `scripts/generate-openapi-lite.ts` spins up the docs-only Nest app, calls `SwaggerModule.createDocument`, and writes `openapi/openapi.lite.json`.
- `scripts/sdk/generate-sdk-lite.ts` transforms the lite spec into the fetch-based client stored in `packages/sdk-lite/`.
- The docs module never listens on a port or touches real infrastructure; it exists solely to generate OpenAPI artifacts for the supported surfaces.

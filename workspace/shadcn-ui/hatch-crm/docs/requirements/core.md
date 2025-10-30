# Core CRM Module Requirements (v1)

## Module: Core Platform & Objects

- Goals: Deliver Salesforce-parity primitives that every vertical can rely on, including robust authn/z, tenant isolation, configurable metadata, and CRUD surfaces for foundational objects.
- Primary Objects: Leads, Accounts, Contacts, Opportunities, Products, Quotes, Orders, Cases, Activities (Tasks, Events, Calls), Files.
- Key User Journeys:
  - Authenticate via OIDC, switch organisations, and land on a personalised home page.
  - Create and manage Accounts/Contacts with field-level security enforced.
  - Progress Opportunities through stage pipelines, attach Products/Quotes/Orders.
  - Log Activities (tasks, events, calls) with reminders and follow-ups.
  - Upload and manage Files with secure URLs and audit trails.
- Minimal Fields:

| Field | Type | Required | FLS Sensitivity |
| --- | --- | --- | --- |
| id | uuid | yes | Internal |
| org_id | uuid | yes | Internal |
| owner_id | uuid | yes | High |
| name (Account/Opportunity) | text | yes | Standard |
| email (Contact) | citext | conditional | High |
| stage (Opportunity) | text | yes | Standard |
| amount (Opportunity) | numeric | optional | High |
| status (Case) | text | yes | Standard |
| body (Activity) | text | optional | High |
| file_url (Files) | text | yes | Restricted |

- List Views & Filters: My Accounts, All Accounts, My Opportunities (board & grid), Opportunities Closing This Quarter, Open Cases by Priority, Recently Viewed Contacts.
- Automations: Lead assignment rules, Opportunity stage entry triggers (create tasks, send emails, update fields), Case escalation timers, Files virus-scan workflow.
- Reports/Dashboards: Pipeline by Stage, Lead Conversion Funnel, Activity Volume by Owner, Case Aging.
- Non-Goals: Advanced CPQ, omnichannel routing, AI forecasting, deep telephony.
- Acceptance Tests:
  - End-to-end OIDC login with organisation switch and session establishment.
  - CRUD for Leads/Accounts/Contacts/Opportunities/Products/Cases with RBAC + FLS checks.
  - Opportunity stage change triggers automation action and audit entry.
  - File upload returns signed URL and logs audit.
  - Global search returns scoped results respecting sharing rules.

### Implementation Notes (S1 Minimal Backbone)

- **Accounts** — Implemented as first-class objects with Prisma models plus Nest `AccountsModule`. Endpoints supply list/search, CRUD, soft-delete, FLS on writes, Audit logging, and attachments via `FilesModule`.
- **Opportunities** — Implemented with stage, amount, currency, account link, and soft-delete lifecycle. Service enforces account tenancy, FLS filtering, and exposes list/detail APIs consumed by new Next.js pages.
- **Files** — Polymorphic `FileObject` + `FileLink` models power signed upload URL generation and attachment linking; reusable attachments panel surfaces on account/opportunity detail pages.
- **Reporting (S3 minimal)** — Daily metrics pipeline persists `MetricsDaily` snapshots for lead conversion, messaging deliverability, Clear Cooperation risk, and pipeline value, exposed through `/reporting/metrics` + dashboard widgets.
- Cases (S5 minimal) ✅ — subject/status/priority/origin/description fields with CRUD (`/cases`, `/cases/:id`), email intake stub, Files linkage.
- Rules Engine (S6 minimal) ✅ — Prisma-backed validation & assignment rule tables, Nest middleware evaluating JSON DSL on Accounts/Opportunities/Cases/RE objects, admin CRUD endpoints guarded by `@Permit('rules', …)`, and a Next.js admin surface with JSON editor and basic smoke tests.
- OpenAPI & SDK (S7a lite) ✅ — Docs-only Nest module (`apps/api/src/docs/docs-app.module.ts`) generates `openapi/openapi.lite.json` via `scripts/generate-openapi-lite.ts`, and `scripts/sdk/generate-sdk-lite.ts` emits the fetch-based lite client under `packages/sdk-lite/`.
- Global Search (S8) ✅ — Nest `SearchModule` serves `GET /search` with query/type/owner/stage/status filters, cursor pagination (`{ items, nextCursor, facets }`), and snippet highlighting; the Next.js `/search` page appends results via `useCursorPager`, renders type facets, and respects Abort-enabled fetches.
- Layouts & Record Types (S9) ✅ — Prisma models `RecordType`, `ObjectLayout`, `FieldLayout` capture admin-managed manifests. Layout resolution prefers profile-specific manifests, then record type, then defaults sourced from shared `FIELD_MAP`, and always intersects with FLS-visible fields. Seeds provision default layouts for Accounts, Opportunities, Contacts, and Leads, the admin UI (`/admin/layouts`) edits list/detail manifests, the pipeline board surfaces the top N manifest fields, and tests cover precedence, FLS masking, integration flows, and Playwright hide-column smoke.

# Seller Opportunity Engine (Seller Likelihood)

This engine finds likely seller opportunities from MLS listing history, scores them, explains the signals, and lets a broker/agent convert an opportunity into a CRM lead.

## What It Produces

- `SellerOpportunity` records (deduped by normalized address).
- A `metricsRun` record (key: `opportunities.seller_likelihood`) storing last-run timestamp + created/updated/candidate counts.
- Optional conversion into a CRM `Lead` + `Person` (leadType `SELLER`) when a user clicks **Convert to lead**.

## Data Sources (MVP)

- **MLS listing history**: `mlsListing` (last 12 months, limited to the org’s active regions).
- **Org footprint**: regions are derived from `orgListing` distinct `(city,state)` pairs; if the org has no listings yet, the engine falls back to a small sample of MLS regions.

## Signals & Scoring

Scoring is a simple weighted sum of signals, clamped to `0–100`.

Current signals (see `SellerOpportunitiesService.scoreListing()`):

- **Off-market transition** (`STATUS_OFF_MARKET`, weight `35`)
  - Detects withdrawn/expired/cancelled/off-market style statuses.
- **Days on market** (`DOM_120`, weight `25`; `DOM_60`, weight `15`)
- **Active + stale** (`ACTIVE_STALE`, weight `10`)
- **High-value property** (`PRICE_BAND`, weight `10` for listPrice ≥ `$750k`)
- **Long listing history** (`LISTING_AGE`, weight `5` for listing age ≥ `180d`)

Each signal includes a human-readable `reason` so the UI can be explainable.

## Dedupe Rules

The engine creates a stable `dedupeKey` from:

`addressLine1 + city + state + postalCode`

Normalization rules:

- lowercased
- punctuation stripped (except `# . -`)
- collapsed whitespace

If a candidate matches an existing `dedupeKey`, the record is **updated** (score/signals/MLS fields/lastSeenAt).

## Assignment Rules (MVP)

When a user converts a seller opportunity:

- A CRM `Person` is created with:
  - `stage = NEW`
  - `leadType = SELLER`
  - `ownerId = current user`
  - `source = seller_opportunity_engine`
- A portal `Lead` is also created for compatibility (links to the `Person`).
- The `SellerOpportunity` is marked `CONVERTED` and stores `convertedLeadId`.

## Background Job (Cron)

Runs every 6 hours (UTC) via Nest schedule:

- Cron: `15 */6 * * *` (`SellerOpportunitiesCron`)
- Iterates orgs discovered from `orgListing` and runs `runForOrg(..., { reason: 'cron' })`

Safety / rollout controls (env vars on the API service):

- `SELLER_OPPORTUNITIES_CRON_ENABLED=true` to enable (disabled by default).
- `SELLER_OPPORTUNITIES_CRON_ORG_IDS=org_123,org_456` to restrict to specific orgs (optional).
- `SELLER_OPPORTUNITIES_CRON_MAX_ORGS_PER_RUN=25` to cap work per cron tick (optional; defaults to `25`, max `500`).

The cron job is DB-backed only (no external HTTP calls in the MVP engine), but it does read `mlsListing`, so keep the org allowlist on for staged rollouts.

## API Endpoints

All endpoints are scoped to org membership and require broker/team-lead/agent access (run requires broker/team-lead).

- `GET /organizations/:orgId/seller-opportunities`
  - Query params:
    - `q` (address search)
    - `status` (`NEW|CONVERTED|DISMISSED`)
    - `minScore` (number)
    - `limit` (1–200)
    - `cursor` (pagination cursor)
  - Returns `{ items, nextCursor, engine }`
- `GET /organizations/:orgId/seller-opportunities/engine`
  - Returns last-run metadata for the engine
- `POST /organizations/:orgId/seller-opportunities/run`
  - Triggers a scan and returns `{ created, updated, candidates }`
- `POST /organizations/:orgId/seller-opportunities/:id/convert`
  - Converts to CRM lead; returns `{ leadId }`

## QA Checklist (Dev)

1. Open `Broker → Opportunities → Seller likelihood`.
2. Click **Run scan**.
   - Expected: toast shows `candidates/created/updated`.
   - Expected: “Last run” timestamp updates; results list refreshes.
3. Adjust filters:
   - Search by address/city/zip
   - Status filter (New/Converted/Dismissed)
   - Min score filter
   - Pagination next/prev works.
4. Convert:
   - Click **Convert to lead** on a `NEW` record.
   - Expected: navigates to `/broker/crm/leads/:id` and the opportunity is now `CONVERTED`.

## Follow-ups (Intentional MVP Gaps)

- Additional data sources (assessor/tax/equity/distress) and ML scoring.
- Dismiss workflow + broker assignment pool.
- True per-org MLS region configuration instead of sampling from existing listings.

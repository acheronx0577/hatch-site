# Real-Estate Vertical Pack Requirements (v1)

## Module: Real-Estate Brokerage Operations

- Goals: Extend the core CRM with brokerage-specific workflows for property marketing, showings, offers, escrow, and commissions while remaining configurable per organisation.
- Primary Objects: Properties, Listings, MLSFeeds, Showings/Tours, Offers, Transactions/Escrow, Commissions, Vendors, Inspections, Disclosures.
- Key User Journeys:
  - Ingest MLS data, normalise into Properties/Listings, and map to Opportunities.
  - Schedule tours/showings, capture buyer feedback, enforce buyer-rep agreements.
  - Record offers, route for approval, and update linked Opportunity + Listing status.
  - Manage escrow milestones and checklists, including disclosures and inspections.
  - Calculate commissions and payout schedules tied to Transactions.
- Minimal Fields:

| Field | Type | Required | FLS Sensitivity |
| --- | --- | --- | --- |
| id | uuid | yes | Internal |
| org_id | uuid | yes | Internal |
| owner_id | uuid | yes | High |
| property.address | jsonb | yes | Standard |
| listing.status | text | yes | Standard |
| listing.list_price | numeric | yes | High |
| showing.start_at | timestamptz | yes | Standard |
| offer.amount | numeric | yes | High |
| transaction.status | text | yes | Standard |
| commission.gross_amount | numeric | yes | High |

- List Views & Filters: Active Listings (by status, DOM), Upcoming Showings, Offers Awaiting Decision, Transactions Closing This Month, Commission Forecast.
- Automations: DOM recalculation nightly, offer submission notifications and approval tasks, listing status sync to Opportunity stage, escrow checklist reminders, commission payout scheduling.
- Reports/Dashboards: Listings Pipeline (status, DOM), Days-on-Market trend, Commission Forecast by Agent, MLSFeed ingestion success rate.
- Non-Goals: Native RESO API production connector, automated valuation models, full CPQ approvals matrix, predictive pricing.
- Acceptance Tests:
  - MLSFeed ingest job creates Properties/Listings scoped by org.
  - Booking a showing enforces buyer agreement and logs activity.
  - Offer approval updates Listing + Opportunity and writes audit events.
  - Escrow checklist completion drives transaction status and triggers notifications.
- Commission payout schedule rolls up to Opportunity and respects sharing.

## Business Rules (intent)

- Offer acceptance is transactional and idempotent; repeat accepts become no-ops.
- At most one offer may be accepted per listing (service-enforced today; partial unique index planned for migration).

## Implementation Notes (S4 Minimal)

- **Offers** — `/re/offers` endpoints provide guarded create/list/decide flows. Accepting an offer provisions a transaction, links opportunities, stores commission preview, and emits domain events.
- **Transactions** — `/re/transactions/:id` exposes detail + milestone updates, commission preview, and payout generation. Checklist state persists as JSON and emits milestone/payout events for automation.
- **Listings** — `/re/listings/:id` surfaces offers + linked transaction with a status endpoint that synchronises opportunity stages and emits `re.listing.status.changed`.
- **Events** — `re.offer.created`, `re.offer.accepted`, `re.transaction.milestone.completed`, `re.payouts.generated` feed the Journeys/Outbox workflow layer for downstream notifications.

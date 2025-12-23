# Close-out Proof Pack (2025-12-21)

This folder is the capture checklist for the remaining punch-list close-out proof.

## Screenshots (save exactly these filenames)

1) `01-lead-gen-no-share-link.png`
   - Route: `/broker/marketing/lead-gen`
   - Confirm: no **“Share a link”** card/CTA appears on the overview page (right rail or anywhere).

2) `02-routing-settings-toggle.png`
   - Route: `/broker/lead-routing`
   - Confirm: **Routing mode** card shows the **Broker approval pool** toggle and the current mode label.

3) `03-broker-approval-pool-actions.png`
   - Route: `/broker/lead-routing`
   - Confirm: **Broker approval pool** table has a pending lead row with **Approve / Reassign / Reject** actions visible.

4) `04-team-roster-density.png`
   - Route: `/broker/team`
   - Confirm: tighter row density (smaller avatar + padding) and sticky header visible when scrolling roster.

5) `05-agent-detail-courted-lite.png`
   - Route: `/broker/agent-performance/:agentProfileId` (open from `/broker/team` → row actions → bar-chart icon)
   - Confirm: **Closed volume**, **Buyer/seller mix**, **Speed + conversion**, **Performance trend** chart, and **Firm rank** are visible.

6) `06-recommended-actions-expanded.png`
   - Route: `/broker/properties/:listingId` (listing must have compliance issues)
   - Action: expand **Compliance issues → View details**
   - Confirm: issue rows show **severity**, **resolution steps**, and at least one **deep link** (“View related details” / “Open broker approval”).

7) `07-mission-control-listings-parity.png`
   - Routes:
     - `/broker/mission-control` (Listings tile)
     - `/broker/properties?filter=ACTIVE` (or corresponding active/pending filter)
   - Confirm: totals match for the same org scope/time.

8) Ask Hatch persistence (two screenshots)
   - `08a-ask-hatch-context-tabs.png`
     - From a lead/listing/transaction: click **Ask Hatch**.
     - Confirm: **Context panel** is above chat and the input starts empty (no context pasted into messages).
   - `08b-ask-hatch-after-refresh.png`
     - Refresh the page.
     - Confirm: the same thread/tab still shows prior messages (history persisted).

## Migration proof (staging)

For safety, do **not** run migrations against an unknown remote DB URL.

Recommended workflow:
1) Point `DATABASE_URL` to your staging database (production-like data).
2) Run: `pnpm -C workspace/shadcn-ui/hatch-crm db:migrate`
3) Verify the deploy output lists all migrations and reports success.

### Local rehearsal (completed)

Migrations were deployed successfully against a fresh local Postgres container using:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:54329/hatch_test?schema=public" \
SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:54329/hatch_test?schema=public" \
pnpm -C workspace/shadcn-ui/hatch-crm db:migrate
```

It applied 23 migrations in order, including the LOI status mapping migration `20251220180500_migrate_offer_intent_statuses`.

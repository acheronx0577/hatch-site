# S7b.2 MR-B3 — Platform Surfaces: Cursor Pager + Shared Errors

## Title
`S7b.2 MR-B3 — Platform surfaces: cursor pager + shared errors`

## Scope
- Audit Messaging (threaded lists if present), Routing, Journeys, Webhooks, and dashboard list widgets.
- For lists that can grow: helpers expose `{ items, nextCursor }` with `AbortSignal`; pages use `useCursorPager`, `LoadMore`, and `ErrorBanner` with client-side de-duplication by stable `id`.
- For single-page views: keep a single page but route failures through `useApiError`/`ErrorBanner`, standardize empty states, and ensure copy matches the shared attachments pattern.

## Acceptance
- Every paginated platform view consumes `{ items, nextCursor }`, cancels stale requests via abort, dedupes by `id`, and hides `LoadMore` when `nextCursor` is empty.
- Single-page views adopt `ErrorBanner` and the standardized empty-state copy.
- No inline `err instanceof Error` checks; all flow through `useApiError`.
- At least one newly paginated platform view verified: `Load more` increases count, dedupe holds, and control hides when exhausted.

## QA Script
1. Webhooks (or similar): load → `Load more` → count increases; rapidly toggle a filter → previous request aborted and no duplicates appear.
2. Force a 401/403: banner shows standard copy; interactive buttons remain disabled while in flight.

## Sanity Checks
- Concurrency guard: `LoadMore` disabled while a fetch is in progress.
- Filter/search reset: drops existing items, sets `nextCursor = undefined`, fetches page 1, then appends subsequent pages; only the latest response applies.
- FLS safe: displayed columns map to fields present on the response DTOs.

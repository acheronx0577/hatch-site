# Pagination & Error Handling Standards

All list views across the web app share the same data envelope, pagination mechanics, and error surface. Use this reference when building or reviewing list experiences.

## Data Envelope & Fetching
- API helpers must return `{ items, nextCursor }` and accept an `AbortSignal`.
- Client code wraps helpers with `useCursorPager` for paginated views, or a simple query hook when a single page is sufficient.
- On any filter/search change: drop existing items, set `nextCursor = undefined`, abort the in-flight request, fetch page 1, then append subsequent pages; only the latest response should win.

## Pagination UI
- Paginated views render the shared `LoadMore` control; hide it automatically when `nextCursor` is `undefined`/empty.
- Allow exactly one fetch in flight per list: disable `LoadMore` while pending and ignore duplicate triggers.
- Dedupe incoming records by stable `id` before merging with existing items; the API avoids repeats but the client guards defensively.
- Track requests via a ref so rapid filter changes cancel older fetches cleanly.

## Error Handling
- Route all failures through `useApiError` and display `ErrorBanner` with standard copy backed by the shared `ApiError` shape.
- Error copy:
  - 401 → “Your session expired. Please sign in and try again.”
  - 403 → “You don’t have permission to perform this action.”
  - Other 4xx → generic fallback plus the first line of any server-provided detail.
- Disable interactive controls (filters, load more, submit buttons) while requests are in flight.
- Never rely on `err instanceof Error`; normalize errors through the shared pipeline.

## Empty States
- For single-page views with zero results, render the standardized empty-state message adopted in Wave B attachments work.
- Provide contextual actions (e.g., “Create webhook”) only after confirming no fetch error is present.

## Testing Expectations
- Manual QA for paginated surfaces: load → load more → confirm count increases, no duplicates, and control hides when exhausted.
- Simulate auth failures (401/403) to verify banner copy and disabled controls.
- Automated coverage should include focused Vitest cases for pagination helpers and any critical dedupe logic.

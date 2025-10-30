# MR-B3: Platform Surfaces Finalization (S7b.2)

## Objective
Close out Wave B platform surface work by bringing every relevant list view onto the shared cursor pagination + error pipeline, and document the verification steps needed before the merge request lands.

## Scope Audit Targets
- Messaging list views (confirm which pages support pagination vs. remain single page).
- Routing, Journeys, and Webhooks admin lists.
- Dashboard widgets that surface more than one page of items.

## Implementation Checklist
1. **Pagination Envelope**  
   - Ensure helpers return `{ items, nextCursor }` with an `AbortSignal` parameter.  
   - Use the same envelope contract already powering Listings, MLS, and attachments.
2. **Paged Views**  
   - Integrate `useCursorPager` with the shared `LoadMore` control.  
   - Allow exactly one fetch in flight; disable `LoadMore` while pending and ignore extra trigger noise.  
   - Merge incoming results by stable `id` to dedupe defensively, even if the API already avoids repeats.
3. **Single-Page Views**  
   - Keep fetch to one page, but route all failures through `useApiError` + `ErrorBanner`.  
   - Align empty-state copy with the Wave B attachments pattern.
4. **Filters & Search**  
   - On every filter or search change: drop existing items, set `nextCursor = undefined`, abort the current request, fetch page 1, then append later pages.  
   - Ensure only the latest response wins by tracking the active request ref.
5. **Error Copy Standardization**  
   - 401: “Your session expired. Please sign in and try again.”  
   - 403: “You don’t have permission to perform this action.”  
   - Other 4xx: show the generic copy plus the first line of any details.  
6. **Code Hygiene**  
   - Remove inline `err instanceof Error` checks in the touched surfaces.  
   - Ensure each view imports the shared error utilities (`useApiError`, `ErrorBanner`) and leans on the `ApiError` shape where applicable.

## Verification & Acceptance
- All paginated platform views now consume `{ items, nextCursor }`, cancel stale requests via abort, dedupe by `id`, and allow only one in-flight fetch.
- Single-page views surface failures exclusively through `ErrorBanner`.
- No `err instanceof Error` checks remain in the affected files.
- At least one newly paginated view (e.g., Webhooks) demonstrates:  
  - `Load more` increases the rendered count.  
  - Control hides automatically when `nextCursor` is empty.

## QA Script
1. Webhooks (or equivalent)  
   - Load initial list, trigger `Load more`, confirm count increases, no duplicates appear, and control hides when `nextCursor` is empty.  
   - Rapidly toggle a filter or search term; verify the prior request aborts, the new request wins, and UI copies stay stable.
2. Auth Failure Handling  
   - Force a 401/403 (e.g., revoke token).  
   - Confirm `ErrorBanner` copy matches standard messaging and that interactive controls disable while fetching.

## Notes
- Capture any helper gaps or repeated boilerplate for follow-up in MR-4 cleanup.  
- Document any surfaces intentionally left single-page so cleanup can re-evaluate later.

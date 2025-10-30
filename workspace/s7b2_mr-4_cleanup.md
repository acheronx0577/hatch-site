# MR-4: Cleanup & Hygiene (S7b.2)

## Objective
Remove final traces of legacy pagination and error handling across `apps/web`, align generated artifacts, and document the new standards so S7b.2 can close cleanly.

## Cleanup Tasks
1. **Legacy Pagination Sweep**  
   - `rg` within `apps/web` for `total`, `pageSize`, `page`, `offset`, and any pre-envelope helper imports.  
   - Replace or remove in favor of helpers returning `{ items, nextCursor }` with `AbortSignal`.  
   - Delete temporary adapters that reshaped arrays into the envelope; client dedupe must live beside `useCursorPager`.
2. **Error Handling Unification**  
   - Search for `err instanceof` and inline error checks; convert to `useApiError` + `ErrorBanner` backed by the shared `ApiError` shape.  
   - Verify every list disables interactive controls while loading and applies the shared error copy (401, 403, default 4xx).
3. **Spec & SDK Alignment**  
   - If Wave B altered DTOs/controllers, run `pnpm run spec:all`.  
   - Review diffs, ensure OpenAPI + generated SDK remain in sync; commit alongside MR if changes exist.
4. **Documentation Update**  
   - Add or amend notes covering:  
     - Standard `{ items, nextCursor }` envelope semantics, `AbortSignal` usage, and dedupe-by-`id`.  
     - Error routing through `useApiError`/`ErrorBanner` with canned copy for 401/403/default 4xx.  
     - Filter/search reset contract (drop items, set `nextCursor = undefined`, abort, fetch page 1, append later pages).  
   - Reference MR-B3 verification steps for onboarding and QA consistency.

## Acceptance Criteria
- No legacy pagination helpers or fields remain in `apps/web`.  
- Repo builds and tests pass: `pnpm --filter @hatch/web lint`, `pnpm --filter @hatch/web test`.  
- `pnpm run spec:all` (and optional `pnpm run spec:verify`) succeed when DTOs change.  
- Documentation reflects the new pagination and error pipelines.

## Pre-Merge Checklist
- [ ] Run `pnpm --filter @hatch/web lint`.  
- [ ] Run `pnpm --filter @hatch/web test`.  
- [ ] Optionally run `pnpm run spec:verify` as a fast smoke.  
- [ ] Capture notes on any remaining migration TODOs to feed v1 prep.

# S7b.2 MR-4 — Final Cleanup: Remove Legacy Pagination, Align Errors, Spec/SDK Smokes

## Title
`S7b.2 MR-4 — Final cleanup: remove legacy pagination, align errors, spec/SDK smokes`

## Scope
- Remove any temporary adapters that output arrays instead of the `{ items, nextCursor }` envelope.
- Repo-wide sweep in `apps/web` for `total`, `pageSize`, `page`, `offset`, and `err instanceof`; replace with cursor pagination and `useApiError`.
- If DTOs/controllers changed during Wave B, regenerate spec + SDK (`pnpm run spec:all`) and confirm smokes.
- Update docs: “All lists use `{ items, nextCursor }`; errors surface via `ErrorBanner`; filters/search reset pagination.”

## Acceptance
- No legacy pagination usage remains in web code.
- Spec/SDK smokes are green when regeneration occurs.
- `pnpm --filter @hatch/web lint` and `pnpm --filter @hatch/web test` succeed.

## Quick Test Plan
- Run the web suite: `pnpm --filter @hatch/web test`.
- Optional docs smoke: `pnpm run spec:verify`.

## Optional Guardrails
1. ESLint rules (web-only) to block legacy pagination tokens and ad-hoc error handling.  
2. Dangerfile check for PR diffs that reintroduce banned tokens.  
3. Pre-push hook running lint, tests, and optional spec smoke.

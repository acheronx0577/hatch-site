# API Style Guide

## Principles

- **OpenAPI-first**: Define and review contracts before implementation.  
- **Consistency**: RESTful resources under `/api/v1/{object}` with predictable verbs.  
- **Security**: Enforce auth, rate limits, and idempotency on all write operations.  
- **Observability**: Emit correlation IDs, structured logs, and metrics per request.

## Resource Model

- List: `GET /api/v1/{object}` with pagination (`page`, `pageSize`), filtering (`q` expression), and sorting (`sort=field:asc`).  
- Detail: `GET /api/v1/{object}/{id}` returns a single record.  
- Create: `POST /api/v1/{object}` with `Idempotency-Key` header.  
- Update: `PATCH /api/v1/{object}/{id}` using partial updates.  
- Delete: `DELETE /api/v1/{object}/{id}` soft-deletes by default.

Bulk operations:  
- `POST /api/v1/{object}/bulk/upsert`  
- `POST /api/v1/{object}/bulk/delete`

## Error Shape

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Stage must be one of: Qualification, Proposal, Closed Won/Lost",
    "details": {
      "field": "stage"
    },
    "correlationId": "c5b3a2f1-..."
  }
}
```

- `code`: snake case machine-readable string.  
- `message`: human-friendly summary.  
- `details`: object or array with contextual information.  
- `correlationId`: forward from `x-correlation-id` header or generate server-side.

## Headers & Metadata

- `Authorization: Bearer <access-token>` (OIDC access token).  
- `Idempotency-Key`: required for POST/PUT/PATCH; dedupe retries for 24h.  
- `X-Correlation-Id`: optional incoming; server issues one if missing.  
- `X-RateLimit-*`: include limit/remaining/reset on responses.

## Versioning

- Path-based: `/api/v1`. Breaking changes require bump to `/api/v2`.  
- Non-breaking additions (fields, endpoints) do not require version changes but must update OpenAPI.

## Pagination

- Default `pageSize` 25, max 200.  
- Include `total` and `links` object with `next`/`prev`.

## Filtering Language

- Query parameter `q` using a safe expression grammar:  
  - Supports `AND`, `OR`, `(` `)`  
  - Operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `IN`, `LIKE`  
  - Field paths mapped to whitelisted columns.

## Documentation & SDKs

- Publish OpenAPI spec at `/api/docs`.  
- Generate TypeScript SDK in `/sdks/ts` with version tied to spec hash.  
- Provide changelog entry for every API revision.

## Testing Requirements

- Contract tests ensure responses match OpenAPI definitions.  
- CI fails on drift between code routes and OpenAPI.  
- Include smoke tests for each critical workflow (auth, CRUD, automation triggers).

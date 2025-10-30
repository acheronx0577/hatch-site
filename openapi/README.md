# OpenAPI & SDK Workflow

This folder stores the committed OpenAPI manifest (`openapi.json`) that describes the Hatch CRM API. The spec is generated from the annotated NestJS controllers using the helper script below.

## Generating the OpenAPI document

> NOTE: run manually when ready.

```bash
pnpm --filter @hatch/api ts-node ../../scripts/generate-openapi.ts
```

The script boots the Nest application without starting the HTTP listener, runs the existing Swagger configuration, and writes the resulting document to `openapi/openapi.json`.

To keep the committed spec from drifting, use the `scripts/check-openapi-drift.sh` helper. It regenerates the spec to a temporary location and diffs it against the repo copy.

```bash
./scripts/check-openapi-drift.sh
```

## Generating the TypeScript SDK

Once the spec is refreshed, regenerate the SDK package to keep its typed surface in sync:

```bash
pnpm ts-node ./scripts/sdk/generate-sdk.ts
```

The generator reads the committed spec and emits the client wrapper plus per-tag API classes under `packages/sdk/src`. The package intentionally contains plain TypeScript sources; consumers can bundle/compile as needed.

## Tests

Two gated tests cover the new functionality:

- `apps/api/test/unit/openapi.routes.spec.ts` validates core paths exist in the in-memory document.
- `packages/sdk/test/sdk.smoke.spec.ts` imports the generated classes to ensure the surface compiles.

Both suites are disabled unless their respective environment flags are enabled so they do not run during normal CI until the automation is wired up.

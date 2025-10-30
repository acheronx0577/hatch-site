#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

node -r ts-node/register "$ROOT_DIR/scripts/generate-openapi.ts" --output "$TMP_DIR/openapi.json" >/dev/null

if ! diff -u "$ROOT_DIR/openapi/openapi.json" "$TMP_DIR/openapi.json" >/dev/null; then
  echo "OpenAPI spec drift detected. Regenerate and commit openapi/openapi.json" >&2
  diff -u "$ROOT_DIR/openapi/openapi.json" "$TMP_DIR/openapi.json" || true
  exit 1
fi

echo "OpenAPI spec matches committed manifest."

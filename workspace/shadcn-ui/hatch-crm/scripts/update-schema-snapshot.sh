#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set" >&2
  exit 1
fi

OUTPUT=docs/DB_SCHEMA_SNAPSHOT.sql
mkdir -p docs
pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" > "$OUTPUT"

if ! git diff --quiet -- "$OUTPUT"; then
  echo "Schema snapshot updated. Commit docs/DB_SCHEMA_SNAPSHOT.sql" >&2
  git --no-pager diff -- "$OUTPUT" || true
  exit 1
fi

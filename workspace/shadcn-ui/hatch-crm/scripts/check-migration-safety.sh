#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_DESTRUCTIVE_MIGRATIONS:-false}" == "true" ]]; then
  exit 0
fi

if [[ ! -d prisma/migrations ]]; then
  echo "No migrations directory found" >&2
  exit 0
fi

DANGEROUS=$(grep -RniE "DROP\s+(TABLE|COLUMN)|ALTER\s+TABLE\s+.*\s+DROP" prisma/migrations/*/migration.sql || true)
if [[ -n "$DANGEROUS" ]]; then
  echo "Destructive migration detected. Set ALLOW_DESTRUCTIVE_MIGRATIONS=true to override." >&2
  echo "$DANGEROUS"
  exit 1
fi

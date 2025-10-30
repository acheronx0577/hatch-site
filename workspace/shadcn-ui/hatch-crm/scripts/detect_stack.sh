#!/usr/bin/env bash
set -euo pipefail

echo "== Stack detection =="
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pushd "$ROOT" >/dev/null

ARTIFACTS=(
  package.json
  pnpm-lock.yaml
  yarn.lock
  pyproject.toml
  requirements.txt
  Gemfile
  go.mod
  pom.xml
  prisma/schema.prisma
  apps/api/prisma/schema.prisma
  Dockerfile
  docker-compose.yml
  infra/docker/docker-compose.yml
  .github/workflows
)

for entry in "${ARTIFACTS[@]}"; do
  if [[ -e "$entry" ]]; then
    echo "FOUND $entry"
  fi
done

echo "== Toolchain versions =="
command -v node >/dev/null && echo "node $(node -v)"
command -v npm >/dev/null && echo "npm $(npm -v)"
command -v pnpm >/dev/null && echo "pnpm $(pnpm -v)"
command -v ts-node >/dev/null && echo "ts-node $(ts-node -v)" || true

popd >/dev/null

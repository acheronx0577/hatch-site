# Hatch CRM Monorepo

Hatch CRM is a contact-first, consent-driven CRM for real estate brokerages. This Turborepo provides:

- `apps/api` — NestJS + Fastify REST API with Prisma/PostgreSQL, Redis-backed outbox, routing engine, and compliance guardrails.
- `apps/web` — Next.js (App Router) frontend for broker dashboard, Contact 360, Tour Booker, Buyer-Rep wizard, and MLS publishing pre-flight.
- `packages/db` — Prisma schema, migrations, and seeds for multi-tenant domain entities.
- `packages/shared` — Domain utilities (consent enforcement, routing, MLS rules, journey simulation, event envelopes).
- `infra/docker` — Local dependencies (Postgres, Redis, MinIO, Mailhog).

## Quick Start

For detailed setup instructions, see **[SETUP.md](SETUP.md)**.

Quick commands:
```bash
# 1. Create .env files (see SETUP.md for details)
# 2. Start Docker services
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Create shadow database
docker exec -i docker-postgres-1 psql -U hatch -d postgres -c "CREATE DATABASE hatch_crm_shadow;"

# 4. Install dependencies
pnpm install

# 5. Run migrations and seed
pnpm --filter @hatch/db migrate:dev
pnpm --filter @hatch/db seed

# 6. Start services
pnpm --filter @hatch/api dev    # http://localhost:4000
pnpm --filter @hatch/web dev    # http://localhost:3000
```

Seeded demo showcases:

1. Attempt SMS to Casey → blocked (no consent).
2. Capture SMS consent via Contact 360 Quick Actions → send succeeds.
3. Request tour without BBA → API returns buyer-rep required payload.
4. Draft + sign BBA in wizard → re-request tour → confirmed & routed.
5. Publishing pre-flight fails without MLS disclaimer → pass after adding required text.

## Documentation

- **[SETUP.md](SETUP.md)** — Complete setup guide for local development
- **[MONOREPO_ARCHITECTURE.md](MONOREPO_ARCHITECTURE.md)** — Detailed explanation of monorepo structure, apps organization, and how components connect
- [Architecture](docs/architecture.md) — System architecture and module overview
- [Data Model](docs/data-model.md) — Prisma schema notes and entity descriptions
- [Compliance Guardrails](docs/compliance.md) — Consent, MLS, and audit guardrails reference
- [Testing Strategy](docs/testing.md) — Testing strategy, coverage, and how to run suites
- [Runbooks](docs/runbooks.md) — Operational runbooks for local dev, staging, and prod

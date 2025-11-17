# Hatch CRM Monorepo

Hatch CRM is a contact-first, consent-driven CRM for real estate brokerages. This Turborepo provides:

Hatch — a contact‑first, consent‑driven platform for real estate brokerages. The workspace includes a full CRM monorepo (API + web), a Shadcn‑UI site/workbench, shared packages, infra, and docs.

Projects

Hatch CRM Monorepo
`apps/api` — NestJS + Fastify REST API, Prisma/PostgreSQL, BullMQ/Redis outbox, routing engine, compliance guardrails, OpenTelemetry.
`apps/web` — Next.js (App Router) broker dashboard, Contact 360, Tour Booker, Buyer‑Rep wizard, MLS publishing pre‑flight.
`packages/db` — Prisma schema, migrations, seeds for multi‑tenant entities.
`packages/shared` — Domain utilities: consent enforcement, routing, MLS rules, journey simulation, event envelopes.
`infra/docker` — Local: Postgres, Redis, MinIO, Mailhog.
Shadcn‑UI Site/Workbench
Vite + React 19, Tailwind, shadcn/ui + Radix; broker CRM surface with Pipeline Board, Client Insights, AI Copilot, and Pipeline Designer.
Supabase client utilities, Stripe client, and a thin API proxy for local dev.
SDKs, OpenAPI, Docs
`openapi/` generated spec + SDK workflow.
`packages/sdk-lite` foundations for a lightweight client SDK.
`docs/` architecture, data model, testing plan, compliance guardrails, and runbooks.
Quick Start

Hatch CRM (API + Web)
## Quick Start

```bash
cd workspace/shadcn-ui/hatch-crm
cp .env.example .env
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d
pnpm --filter @hatch/db migrate:dev
pnpm --filter @hatch/db seed
pnpm --filter @hatch/api dev    # http://localhost:4000 (OpenAPI at /docs)
pnpm --filter @hatch/web dev    # http://localhost:3000
```

```bash
cd workspace/shadcn-ui
pnpm install
pnpm dev    # http://localhost:5173
```

Seeded Demo Scenarios (CRM)

SMS to Casey → blocked (no consent); capture consent in Contact 360 → send succeeds.
Request tour w/o BBA → API returns buyer‑rep required payload; sign BBA → re‑request → confirmed & routed.
MLS publishing pre‑flight fails without disclaimer → pass after adding required text.
Tech Highlights

API: NestJS, Fastify, Prisma/PostgreSQL, BullMQ/Redis, OpenTelemetry, Zod, SendGrid.
Web: Next.js + shadcn/ui, Tailwind, TanStack Query, React Hook Form.
Site/Workbench: Vite + React 19, shadcn/ui + Radix, Supabase client, Stripe, dnd‑kit, framer‑motion.
Documentation

Architecture: workspace/shadcn-ui/hatch-crm/docs/architecture.md
Data Model: workspace/shadcn-ui/hatch-crm/docs/data-model.md
Compliance: workspace/shadcn-ui/hatch-crm/docs/compliance.md
Testing: workspace/shadcn-ui/hatch-crm/docs/testing.md
Runbooks: workspace/shadcn-ui/hatch-crm/docs/runbooks.md

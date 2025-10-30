# ADR-0001: Domain Scope & Product Surface

- Status: Accepted
- Date: 2025-02-14
- Drivers: Core CRM parity, vertical extensibility, roadmap pressure

## Context

Stakeholders require a Salesforce-class CRM platform while maintaining the brokerage-specific functionality that currently differentiates Hatch. The existing codebase is heavily biased toward residential real-estate workflows, making it difficult to generalise without losing vertical value or reworking large swaths of code.

## Decision

Build a generic CRM core with a dedicated real-estate vertical pack.

- Core delivers extensible objects (Leads, Accounts, Contacts, Opportunities, Products, Quotes, Orders, Cases, Activities, Files) plus platform foundations (OIDC auth, tenancy, RBAC, FLS, sharing, audit, search, automation, reporting, OpenAPI-first API).
- Real-estate pack lives under `verticals/real-estate` with its own migrations, UI surfaces, automation rules, and reports. It maps to core via junctions (e.g., Listing ↔ Opportunity) without polluting shared schemas.
- Additional vertical packs can follow the same pattern (e.g., SaaS Sales, Field Service).

## Consequences

- Schema work must separate core tables from vertical-specific ones; migrations for the vertical pack should be namespaced.
- Platform services (authorization, workflow engine, reporting) must accept pluggable object metadata so vertical packs register additional objects, fields, and permissions.
- Testing and documentation need to distinguish between baseline CRM behaviour and vertical augmentations.
- Roadmap milestones gate vertical features until core platform foundations (M1) and core CRM objects (M2) are stable and fully tested.

## Alternatives Considered

1. **Retain real-estate-specific core** – rejected because it blocks expansion into other verticals and complicates platform abstractions.
2. **Fork separate products** – rejected due to duplication of shared services, higher maintenance cost, and fractured roadmap.

## Follow-Up Actions

- Create metadata registries for object definitions so vertical packs can register fields and behaviours.
- Update documentation to clarify which features belong to the core product versus the real-estate pack.
- Ensure CI enforces that vertical migrations and seeds do not run for tenants without the corresponding feature flag.

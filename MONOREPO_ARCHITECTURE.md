# Hatch CRM Monorepo Architecture - Detailed Explanation

This document provides a comprehensive overview of how the Hatch CRM monorepo is organized, focusing on the relationship between `apps/web`, `apps/api`, and the shared packages.

## Table of Contents

1. [Monorepo Overview](#monorepo-overview)
2. [Package Management](#package-management)
3. [Apps Structure](#apps-structure)
4. [Shared Packages](#shared-packages)
5. [How Apps Connect](#how-apps-connect)
6. [Module Organization Patterns](#module-organization-patterns)
7. [Build & Development Workflow](#build--development-workflow)

---

## Monorepo Overview

The Hatch CRM project uses a **monorepo architecture** managed by:
- **pnpm workspaces** - For package management and dependency resolution
- **Turborepo** - For build orchestration and task running
- **TypeScript** - Shared base configuration across all packages

### Directory Structure

```
hatch-crm/
├── apps/                    # Application packages (runnable services)
│   ├── api/                 # NestJS REST API backend
│   └── web/                 # Next.js frontend application
├── packages/                # Shared library packages
│   ├── db/                  # Prisma schema & database layer
│   ├── shared/              # Domain logic & utilities
│   └── config/              # Configuration utilities
├── infra/                   # Infrastructure as code
│   └── docker/              # Docker Compose for local services
├── docs/                    # Documentation
├── package.json             # Root workspace configuration
├── pnpm-workspace.yaml      # Workspace definition
├── turbo.json               # Turborepo pipeline configuration
└── tsconfig.base.json       # Shared TypeScript config
```

---

## Package Management

### pnpm Workspaces

The `pnpm-workspace.yaml` defines which directories are part of the workspace:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "infra/*"
```

This allows:
- **Shared dependencies** - Common packages installed once at the root
- **Internal package references** - Apps can import from packages using `@hatch/db`, `@hatch/shared`
- **Workspace protocol** - Dependencies use `workspace:*` to reference internal packages

### Internal Package References

**In `apps/api/package.json`:**
```json
{
  "dependencies": {
    "@hatch/db": "workspace:*",      // References packages/db
    "@hatch/shared": "workspace:*"    // References packages/shared
  }
}
```

**In `apps/web/package.json`:**
```json
{
  "dependencies": {
    "@hatch/shared": "workspace:*"    // Only needs shared, not db
  }
}
```

### Turborepo Pipeline

The `turbo.json` defines build dependencies:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],  // Build dependencies first
      "outputs": ["dist/**", "build/**", ".next/**"]
    },
    "dev": {
      "cache": false  // Don't cache dev mode
    }
  }
}
```

This ensures:
- Packages are built before apps that depend on them
- Parallel execution where possible
- Caching of build outputs

---

## Apps Structure

### `apps/api` - NestJS Backend

**Technology Stack:**
- **NestJS** - Enterprise Node.js framework
- **Fastify** - High-performance HTTP server (instead of Express)
- **Prisma** - Type-safe database ORM
- **Redis** - Caching and outbox pattern
- **Swagger/OpenAPI** - API documentation

**Structure:**
```
apps/api/
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module (imports all feature modules)
│   └── modules/                   # Feature modules (domain-driven)
│       ├── contacts/
│       │   ├── contacts.module.ts      # Module definition
│       │   ├── contacts.controller.ts  # HTTP endpoints
│       │   ├── contacts.service.ts     # Business logic
│       │   └── dto/                    # Data Transfer Objects
│       ├── consents/
│       ├── messages/
│       ├── tours/
│       └── ... (20+ modules)
├── scripts/
│   └── sync-prisma-client.js      # Prisma client sync script
├── test/                          # E2E tests
├── package.json
└── tsconfig.json
```

**Key Characteristics:**

1. **Modular Architecture** - Each domain feature is a self-contained module:
   ```typescript
   @Module({
     imports: [OutboxModule],           // Dependencies
     controllers: [ContactsController], // HTTP endpoints
     providers: [ContactsService]       // Business logic
   })
   export class ContactsModule {}
   ```

2. **Controller-Service Pattern**:
   - **Controllers** - Handle HTTP requests/responses, validation
   - **Services** - Contain business logic, database operations
   - **DTOs** - Type-safe request/response schemas

3. **Global Configuration** in `app.module.ts`:
   - Database connection (Prisma)
   - Redis connection
   - CORS, Helmet security
   - Global validation pipes
   - Swagger documentation

4. **API Prefix** - All routes prefixed with `/api`:
   ```typescript
   app.setGlobalPrefix('api');
   // Results in: /api/contacts, /api/tours, etc.
   ```

5. **Request Context** - Multi-tenant support via headers:
   ```typescript
   // Extracts tenant/user from headers
   const ctx = resolveRequestContext(req);
   // Headers: x-tenant-id, x-user-id, x-user-role
   ```

### `apps/web` - Next.js Frontend

**Technology Stack:**
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **React Query / SWR** - Data fetching
- **React Hook Form** - Form management

**Structure:**
```
apps/web/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (navigation)
│   ├── page.tsx                  # Home page
│   ├── dashboard/
│   │   └── page.tsx              # Dashboard route
│   ├── people/
│   │   ├── page.tsx               # Contact list
│   │   └── [id]/
│   │       └── page.tsx          # Contact detail (dynamic route)
│   ├── tour-booker/
│   │   └── page.tsx              # Tour booking
│   └── ...
├── components/                   # Reusable React components
│   ├── bba-wizard.tsx
│   ├── contact-actions.tsx
│   └── ...
├── lib/
│   └── api.ts                    # API client (centralized HTTP calls)
├── package.json
└── tsconfig.json
```

**Key Characteristics:**

1. **App Router** - Next.js 13+ file-based routing:
   - `app/dashboard/page.tsx` → `/dashboard`
   - `app/people/[id]/page.tsx` → `/people/:id`

2. **Server Components by Default**:
   ```typescript
   // Server Component (runs on server)
   export default async function PeoplePage() {
     const contacts = await listContacts(TENANT_ID);
     return <div>...</div>;
   }
   ```

3. **Centralized API Client** (`lib/api.ts`):
   - Handles API URL resolution (dev vs production)
   - Adds required headers (tenant-id, user-id)
   - Type-safe response types
   - Error handling

4. **No Direct Database Access** - Frontend only talks to API:
   ```typescript
   // Frontend calls API
   const contacts = await listContacts(TENANT_ID);
   // Which calls: GET http://localhost:4000/api/contacts?tenantId=...
   ```

---

## Shared Packages

### `packages/db` - Database Layer

**Purpose:** Centralized database schema and access

**Contents:**
- `prisma/schema.prisma` - Database schema definition
- `prisma/migrations/` - Migration history
- `src/index.ts` - Exports PrismaClient instance
- `src/seed.ts` - Database seeding script

**Usage:**
```typescript
// In apps/api
import { prisma } from '@hatch/db';

const contacts = await prisma.person.findMany({
  where: { tenantId: ctx.tenantId }
});
```

**Key Features:**
- Single source of truth for database schema
- Type-safe database queries
- Migrations managed centrally
- Extended PrismaClient with logging

### `packages/shared` - Domain Logic

**Purpose:** Business logic shared between API and potentially other services

**Contents:**
- `consent.ts` - Consent validation logic
- `routing.ts` - Agent routing algorithms
- `mls.ts` - MLS compliance rules
- `journeys.ts` - Journey simulation
- `events.ts` - Event type definitions
- `validation.ts` - Shared validation schemas

**Usage:**
```typescript
// In apps/api
import { checkConsent, ConsentChannel } from '@hatch/shared';

const canSend = checkConsent(consents, ConsentChannel.SMS);
```

**Key Features:**
- Pure TypeScript functions (no framework dependencies)
- Testable in isolation
- Reusable across services
- Domain-driven design

### `packages/config` - Configuration

**Purpose:** Environment variable utilities

**Contents:**
- `src/index.ts` - `getEnv()`, `getNumberEnv()` helpers

**Usage:**
```typescript
import { getEnv } from '@hatch/config';

const dbUrl = getEnv('DATABASE_URL');
```

---

## How Apps Connect

### Communication Flow

```
┌─────────────┐         HTTP/REST          ┌─────────────┐
│  apps/web   │ ────────────────────────>  │  apps/api   │
│  (Next.js)  │ <────────────────────────  │  (NestJS)   │
│  Port 3000  │      JSON Responses        │  Port 4000  │
└─────────────┘                            └─────────────┘
      │                                           │
      │                                           │
      │         ┌────────────────┐                │
      └────────>│ @hatch/shared  │<───────────────┘
                │  (Domain Logic)│
                └────────────────┘
                      │
                      │
      ┌───────────────┴─────────────────┐
      │                                 │
      ▼                                 ▼
┌─────────────┐                 ┌─────────────┐
│ @hatch/db   │                 │  PostgreSQL │
│  (Prisma)   │ ──────────────> │  Port 5432  │
└─────────────┘                 └─────────────┘
```

### Example: Contact List Flow

1. **Frontend Request** (`apps/web/app/people/page.tsx`):
   ```typescript
   const contacts = await listContacts(TENANT_ID);
   ```

2. **API Client** (`apps/web/lib/api.ts`):
   ```typescript
   export async function listContacts(tenantId: string) {
     return apiFetch<ContactListItem[]>(`/contacts?tenantId=${tenantId}`);
   }
   // Makes: GET http://localhost:4000/api/contacts?tenantId=tenant-hatch
   ```

3. **API Controller** (`apps/api/src/modules/contacts/contacts.controller.ts`):
   ```typescript
   @Get()
   async listContacts(@Query() query: ListContactsQueryDto, @Req() req) {
     const ctx = resolveRequestContext(req);
     return this.contacts.list(query, ctx);
   }
   ```

4. **Service Layer** (`apps/api/src/modules/contacts/contacts.service.ts`):
   ```typescript
   async list(query: ListContactsQueryDto, ctx: RequestContext) {
     // Uses @hatch/db
     return prisma.person.findMany({
       where: { tenantId: ctx.tenantId }
     });
   }
   ```

5. **Database** - Prisma queries PostgreSQL and returns typed results

### Shared Code Usage

**Both apps use `@hatch/shared`:**

```typescript
// In apps/api/src/modules/messages/messages.service.ts
import { checkConsent } from '@hatch/shared';

if (!checkConsent(consents, ConsentChannel.SMS)) {
  throw new ForbiddenException('No SMS consent');
}
```

```typescript
// In apps/web/components/contact-actions.tsx
// Could use shared validation if needed
import { validateEmail } from '@hatch/shared';
```

---

## Module Organization Patterns

### API Module Pattern

Each feature module follows this structure:

```
modules/contacts/
├── contacts.module.ts          # NestJS module definition
├── contacts.controller.ts      # HTTP endpoints (GET, POST, etc.)
├── contacts.service.ts         # Business logic
└── dto/                         # Data Transfer Objects
    ├── create-contact.dto.ts
    ├── update-contact.dto.ts
    └── list-contacts.dto.ts
```

**Module Definition:**
```typescript
@Module({
  imports: [OutboxModule],           // Dependencies on other modules
  controllers: [ContactsController], // Exposed HTTP endpoints
  providers: [ContactsService]       // Injectable services
})
export class ContactsModule {}
```

**Controller Pattern:**
```typescript
@Controller('contacts')  // Base route: /api/contacts
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()                // GET /api/contacts
  async list() { ... }

  @Get(':id')           // GET /api/contacts/:id
  async getOne() { ... }

  @Post()               // POST /api/contacts
  async create() { ... }
}
```

### Web Page Pattern

Next.js App Router structure:

```
app/
├── layout.tsx           # Shared layout (navigation, etc.)
├── page.tsx             # Home page (/)
├── dashboard/
│   └── page.tsx         # Dashboard page (/dashboard)
└── people/
    ├── page.tsx         # List page (/people)
    └── [id]/
        └── page.tsx     # Detail page (/people/:id)
```

**Page Component:**
```typescript
// Server Component (default)
export default async function PeoplePage() {
  const contacts = await listContacts(TENANT_ID);
  return <div>...</div>;
}

// Or Client Component (if needed)
'use client';
export default function InteractiveComponent() {
  const [state, setState] = useState();
  return <div>...</div>;
}
```

---

## Build & Development Workflow

### Development Mode

**Run both apps in parallel:**
```bash
pnpm dev
# Runs: turbo run dev --parallel
# Starts both apps/api and apps/web
```

**Run individually:**
```bash
pnpm --filter @hatch/api dev   # API only (port 4000)
pnpm --filter @hatch/web dev   # Web only (port 3000)
```

### Build Process

**Turborepo build order:**
1. Build `packages/shared` (no dependencies)
2. Build `packages/db` (depends on shared)
3. Build `packages/config` (depends on shared)
4. Build `apps/api` (depends on db, shared, config)
5. Build `apps/web` (depends on shared)

**Build command:**
```bash
pnpm build
# Runs: turbo run build
# Respects dependencies defined in turbo.json
```

### Dependency Graph

```
packages/shared (no deps)
    │
    ├──> packages/db
    │       │
    │       └──> apps/api
    │
    ├──> packages/config
    │
    └──> apps/web
```

## Summary

The Hatch CRM monorepo is organized as:

- **2 Applications**: `apps/api` (backend) and `apps/web` (frontend)
- **3 Shared Packages**: `packages/db` (database), `packages/shared` (domain logic), `packages/config` (utilities)
- **Communication**: HTTP REST API between web and api
- **Shared Code**: Both apps import from `@hatch/shared` and `@hatch/db` (api only)
- **Build System**: Turborepo orchestrates builds respecting dependencies
- **Package Manager**: pnpm workspaces manage internal package references



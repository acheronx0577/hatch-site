# Hatch CRM - Setup Guide

This guide will help you set up and run the Hatch CRM project on your local machine.

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** 22.x ([Download](https://nodejs.org/))
- **pnpm** 8.15.4 or later (`npm install -g pnpm`)
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/))
- **Git** (for cloning the repository)

## Quick Start

### 1. Navigate to Project Directory

```bash
cd workspace/shadcn-ui/hatch-crm
```

### 2. Create Environment File

Create a `.env` file in the `packages/db/` directory with the following content:

```env
# Database Configuration
DATABASE_URL=postgresql://hatch:hatch@localhost:5432/hatch_crm?schema=public
SHADOW_DATABASE_URL=postgresql://hatch:hatch@localhost:5432/hatch_crm_shadow?schema=public

# Redis Configuration
REDIS_URL=redis://localhost:6379

# API Configuration
API_HOST=0.0.0.0
API_PORT=4000
API_WEBHOOK_SECRET=dev-webhook-secret-change-in-production

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_TENANT_ID=tenant-hatch
NEXT_PUBLIC_DEFAULT_USER_ID=user-agent

# Email Configuration (for local development)
EMAIL_SENDER_DOMAIN=example.hatchcrm.test

# Attachment Configuration
ATTACHMENT_TOKEN_SECRET=dev-attachment-secret-change-in-production
ATTACHMENT_TOKEN_TTL_MS=900000
ATTACHMENT_MAX_SIZE_BYTES=10485760
ATTACHMENT_ALLOWED_MIME_TYPES=image/png,image/jpeg,image/gif,application/pdf,text/plain

# Feature Flags
FEATURE_DEAL_DESK_COMMISSION=false

# Outbox Configuration
OUTBOX_MAX_ATTEMPTS=5
```

**Note:** Also create the same `.env` file in:
- `apps/api/.env` (for API runtime)
- Root `hatch-crm/.env` (for monorepo tools)

### 3. Start Docker Services

Start the required infrastructure services (PostgreSQL, Redis, MinIO, Mailhog):

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This will start:
- **PostgreSQL** on port `5432`
- **Redis** on port `6379`
- **MinIO** (object storage) on ports `9000` (API) and `9001` (Console)
- **Mailhog** (email testing) on ports `1025` (SMTP) and `8025` (Web UI)

Verify containers are running:
```bash
docker ps
```

### 4. Create Shadow Database

Prisma requires a shadow database for migrations. Create it:

```bash
docker exec -i docker-postgres-1 psql -U hatch -d postgres -c "CREATE DATABASE hatch_crm_shadow;"
```

### 5. Install Dependencies

```bash
pnpm install
```

### 6. Run Database Migrations

```bash
pnpm --filter @hatch/db migrate:dev
```

This will apply all database migrations and generate the Prisma client.

### 7. Seed the Database

Populate the database with demo data:

```bash
pnpm --filter @hatch/db seed
```

### 8. Start the Application

You need to run two services:

#### Terminal 1 - Start API Server
```bash
pnpm --filter @hatch/api dev
```

The API will be available at:
- **API Base:** `http://localhost:4000`
- **API Docs:** `http://localhost:4000/docs`
- **Health Check:** `http://localhost:4000/api/health`

#### Terminal 2 - Start Web Frontend
```bash
pnpm --filter @hatch/web dev
```

The web application will be available at:
- **Web App:** `http://localhost:3000`
- **Dashboard:** `http://localhost:3000/dashboard`

## Alternative: Run Both Services Together

You can also run both services in parallel from the root:

```bash
pnpm dev
```

This starts both API and web frontend simultaneously.

## Access Points

Once everything is running:

- **Web Application:** http://localhost:3000
- **API Server:** http://localhost:4000
- **API Documentation:** http://localhost:4000/docs
- **Mailhog (Email Testing):** http://localhost:8025
- **MinIO Console:** http://localhost:9001 (login: hatch / hatch-secret)

## Demo Flow

After seeding, you can test these features:

1. Navigate to **People** → open `Casey ColdLead`
2. Try to send SMS → blocked (no consent)
3. Capture SMS consent via Quick Actions → send succeeds
4. Go to **Tour Booker** → select `Casey` + listing `123 Harbor Way` → receives buyer-rep required response
5. Open **BBA Wizard** → draft & sign buyer-rep for Casey
6. Retry **Tour Booker** → tour confirmed (routing auto-assigns agent)
7. Go to **MLS Preflight** → run without disclaimer (fails) → insert disclaimer (passes)

## Common Commands

### Database
```bash
# Run migrations
pnpm --filter @hatch/db migrate:dev

# Seed database
pnpm --filter @hatch/db seed

# Open Prisma Studio (database GUI)
pnpm --filter @hatch/db studio
```

### Development
```bash
# Run all services
pnpm dev

# Run API only
pnpm --filter @hatch/api dev

# Run web only
pnpm --filter @hatch/web dev
```

### Testing
```bash
# Run all tests
pnpm test

# Run shared package tests
pnpm --filter @hatch/shared test

# Run API tests
pnpm --filter @hatch/api test
```

### Linting
```bash
pnpm lint
```

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE: address already in use`:

**Windows PowerShell:**
```powershell
# Find process using port 4000
netstat -ano | findstr :4000

# Kill the process (replace <PID> with the process ID)
Stop-Process -Id <PID> -Force
```

**Or change the port** in `.env`:
```env
API_PORT=4001
```

### Database Connection Errors

1. **Verify Docker containers are running:**
   ```bash
   docker ps
   ```

2. **Check if PostgreSQL is accessible:**
   ```bash
   docker exec -it docker-postgres-1 psql -U hatch -d hatch_crm
   ```

3. **Restart Docker containers:**
   ```bash
   docker compose -f infra/docker/docker-compose.yml restart
   ```

### Environment Variables Not Found

Ensure `.env` files exist in:
- `packages/db/.env` (for Prisma)
- `apps/api/.env` (for API)
- Root `hatch-crm/.env` (for monorepo)

### Prisma Client Issues

If you see Prisma client errors:

```bash
# Regenerate Prisma client
pnpm --filter @hatch/db generate
```

### Migration Errors

If migrations fail:

```bash
# Reset database (WARNING: This deletes all data)
pnpm --filter @hatch/db migrate:dev --name reset
```

## Project Structure

```
hatch-crm/
├── apps/
│   ├── api/          # NestJS + Fastify REST API (port 4000)
│   └── web/          # Next.js frontend (port 3000)
├── packages/
│   ├── db/           # Prisma schema and migrations
│   ├── shared/       # Shared domain utilities
│   └── config/       # Configuration utilities
├── infra/
│   └── docker/       # Docker Compose for local services
└── docs/             # Documentation
```

## Additional Resources

- [Architecture Documentation](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Compliance Guardrails](docs/compliance.md)
- [Testing Strategy](docs/testing.md)
- [Runbooks](docs/runbooks.md)

## Need Help?

If you encounter issues not covered here:
1. Check the [Runbooks](docs/runbooks.md) for operational guidance
2. Review the [Architecture Documentation](docs/architecture.md)
3. Check Docker logs: `docker compose -f infra/docker/docker-compose.yml logs`


# Hatch Real Estate Platform

Full-stack real estate platform: Frontend (React) + Backend (NestJS CRM)

## Prerequisites

- Node.js 22.x
- pnpm: `npm install -g pnpm`
- Docker Desktop
- Supabase account (for frontend auth)

---

## Frontend Setup

### 1. Install & Configure
```bash
cd workspace/shadcn-ui
pnpm install
```

Create `.env` file:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
```

Get credentials from [supabase.com](https://supabase.com) → Settings → API

### 2. Setup Database (Supabase SQL Editor)
```sql
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'agent', 'broker', 'admin'))
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
```

### 3. Run
```bash
pnpm dev
```
→ http://localhost:5173

---

## Backend Setup

### 1. Install & Configure
```bash
cd workspace/shadcn-ui/hatch-crm
pnpm install
```

Create `.env` in 3 locations (`packages/db/.env`, `apps/api/.env`, `hatch-crm/.env`):
```env
DATABASE_URL=postgresql://hatch:hatch@localhost:5432/hatch_crm?schema=public
SHADOW_DATABASE_URL=postgresql://hatch:hatch@localhost:5432/hatch_crm_shadow?schema=public
REDIS_URL=redis://localhost:6379
API_PORT=4000
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 2. Start Docker
```bash
docker compose -f infra/docker/docker-compose.yml up -d
docker exec -i docker-postgres-1 psql -U hatch -d postgres -c "CREATE DATABASE hatch_crm_shadow;"
```

### 3. Setup Database
```bash
pnpm --filter @hatch/db migrate:dev
pnpm --filter @hatch/db seed
```

### 4. Run
```bash
pnpm --filter @hatch/api dev
```
→ http://localhost:4000

---

## Troubleshooting

**Port in use:**
```bash
netstat -ano | findstr :5173
Stop-Process -Id <PID> -Force
```

**Docker issues:**
```bash
cd workspace/shadcn-ui/hatch-crm
docker compose -f infra/docker/docker-compose.yml restart
```

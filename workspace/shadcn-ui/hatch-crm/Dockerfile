FROM node:22-alpine

ENV NODE_ENV=production

# System deps and pnpm
RUN apk add --no-cache bash openssl && npm install -g pnpm

# Copy the monorepo
WORKDIR /app
COPY workspace/shadcn-ui/hatch-crm ./workspace/shadcn-ui/hatch-crm

# Install dependencies from the monorepo root
WORKDIR /app/workspace/shadcn-ui/hatch-crm
# Install with dev deps so build tools (prisma/nest) are available
RUN pnpm install --frozen-lockfile --prod=false

# Build API (and generate Prisma client)
RUN pnpm --filter @hatch/db run generate && pnpm --filter @hatch/api run build:dist

# Run migrations on startup (idempotent) then start the API
CMD ["sh", "-c", "pnpm --filter @hatch/db migrate && pnpm --filter @hatch/api start"]

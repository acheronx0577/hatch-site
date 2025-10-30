-- Add new activity types
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MESSAGE_BLOCKED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_MERGE_PROPOSED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_MERGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_EMAIL_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_PHONE_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_STAGE_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_OWNER_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_TAGS_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_DELETED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'CONTACT_RESTORED';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'NOTE_ADDED';

-- Buyer rep status enum for contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'BuyerRepStatus'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "public"."BuyerRepStatus" AS ENUM ('ACTIVE', 'NONE', 'EXPIRED');
  END IF;
END$$;

-- Merge status enum for contact merge proposals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'MergeStatus'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "public"."MergeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
  END IF;
END$$;

-- Extend person table with Phase 1 fields
ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "secondaryEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "secondaryPhones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "buyerRepStatus" "BuyerRepStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "doNotContact" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- Unique per-tenant identifiers on primary contact methods
CREATE UNIQUE INDEX IF NOT EXISTS "Person_tenantId_primaryEmail_key"
  ON "Person" ("tenantId", "primaryEmail")
  WHERE "primaryEmail" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Person_tenantId_primaryPhone_key"
  ON "Person" ("tenantId", "primaryPhone")
  WHERE "primaryPhone" IS NOT NULL;

-- Soft delete filter support
CREATE INDEX IF NOT EXISTS "Person_tenantId_deletedAt_idx"
  ON "Person" ("tenantId", "deletedAt");

DO $$
BEGIN
  IF current_schema = 'public' AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'team_members'
  ) THEN
    ALTER TABLE public."team_members"
      ALTER COLUMN "org_id" TYPE TEXT USING "org_id"::TEXT;
  END IF;
END$$;

-- Saved views per user
CREATE TABLE IF NOT EXISTS "SavedView" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SavedView_user_name_key" UNIQUE ("userId", "name")
);

-- Contact merge proposals table
CREATE TABLE IF NOT EXISTS "ContactMergeProposal" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "existingPersonId" TEXT NOT NULL,
  "incomingPayload" JSONB NOT NULL,
  "proposedByUserId" TEXT NOT NULL,
  "status" "MergeStatus" NOT NULL DEFAULT 'PENDING',
  "resolutionPayload" JSONB,
  "resolvedAt" TIMESTAMPTZ,
  "resolvedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactMergeProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactMergeProposal_existingPersonId_fkey" FOREIGN KEY ("existingPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactMergeProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactMergeProposal_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContactMergeProposal_tenant_status_idx"
  ON "ContactMergeProposal" ("tenantId", "status");

-- Ensure citext exists before using it for email columns
CREATE EXTENSION IF NOT EXISTS "citext";

-- New enums for RBAC / sharing / audit scaffolding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PermissionHolderType') THEN
    CREATE TYPE "PermissionHolderType" AS ENUM ('PROFILE', 'PERMISSION_SET');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShareGranteeType') THEN
    CREATE TYPE "ShareGranteeType" AS ENUM ('USER', 'ROLE', 'TEAM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShareAccess') THEN
    CREATE TYPE "ShareAccess" AS ENUM ('READ', 'WRITE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
    CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SHARE', 'LOGIN');
  END IF;
END$$;

-- Organization wide metadata
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "plan" TEXT DEFAULT 'standard';

-- User identity enhancements
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'active';
ALTER TABLE "User"
  ALTER COLUMN "email" TYPE CITEXT USING "email"::citext;

-- Tenancy-aware membership & RBAC tables
CREATE TABLE IF NOT EXISTS "Role" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Role_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Role_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Role"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Role_orgId_idx" ON "Role" ("orgId");

-- Profiles describe baseline permissions per org
CREATE TABLE IF NOT EXISTS "Profile" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Profile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Profile_orgId_idx" ON "Profile" ("orgId");

CREATE TABLE IF NOT EXISTS "UserOrgMembership" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "roleId" TEXT,
  "profileId" TEXT,
  "isOrgAdmin" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "UserOrgMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "UserOrgMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "UserOrgMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL,
  CONSTRAINT "UserOrgMembership_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserOrgMembership_userId_orgId_key"
  ON "UserOrgMembership" ("userId", "orgId");
CREATE INDEX IF NOT EXISTS "UserOrgMembership_orgId_idx"
  ON "UserOrgMembership" ("orgId");
CREATE INDEX IF NOT EXISTS "UserOrgMembership_profileId_idx"
  ON "UserOrgMembership" ("profileId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserOrgMembership' AND column_name = 'profileId'
  ) THEN
    ALTER TABLE "UserOrgMembership" ADD COLUMN "profileId" TEXT;
    ALTER TABLE "UserOrgMembership"
      ADD CONSTRAINT "UserOrgMembership_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "UserOrgMembership_profileId_idx"
      ON "UserOrgMembership" ("profileId");
  END IF;
END$$;

-- Permission sets for additive rights
CREATE TABLE IF NOT EXISTS "PermissionSet" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PermissionSet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PermissionSet_orgId_idx" ON "PermissionSet" ("orgId");

CREATE TABLE IF NOT EXISTS "PermissionSetAssignment" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "permissionSetId" TEXT NOT NULL,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PermissionSetAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PermissionSetAssignment_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PermissionSetAssignment_userId_permissionSetId_key"
  ON "PermissionSetAssignment" ("userId", "permissionSetId");
CREATE INDEX IF NOT EXISTS "PermissionSetAssignment_permissionSetId_idx"
  ON "PermissionSetAssignment" ("permissionSetId");

-- Object level permissions (profiles or permission sets)
CREATE TABLE IF NOT EXISTS "ObjectPermission" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "holderType" "PermissionHolderType" NOT NULL,
  "holderId" TEXT NOT NULL,
  "object" TEXT NOT NULL,
  "canCreate" BOOLEAN NOT NULL DEFAULT FALSE,
  "canRead" BOOLEAN NOT NULL DEFAULT TRUE,
  "canUpdate" BOOLEAN NOT NULL DEFAULT FALSE,
  "canDelete" BOOLEAN NOT NULL DEFAULT FALSE,
  "profileId" TEXT,
  "permissionSetId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ObjectPermission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "ObjectPermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE,
  CONSTRAINT "ObjectPermission_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ObjectPermission_org_holder_object_idx"
  ON "ObjectPermission" ("orgId", "holderType", "holderId", "object");
CREATE INDEX IF NOT EXISTS "ObjectPermission_profile_idx"
  ON "ObjectPermission" ("profileId");
CREATE INDEX IF NOT EXISTS "ObjectPermission_permission_set_idx"
  ON "ObjectPermission" ("permissionSetId");

-- Field level permissions
CREATE TABLE IF NOT EXISTS "FieldPermission" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "holderType" "PermissionHolderType" NOT NULL,
  "holderId" TEXT NOT NULL,
  "object" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "canRead" BOOLEAN NOT NULL DEFAULT TRUE,
  "canWrite" BOOLEAN NOT NULL DEFAULT FALSE,
  "profileId" TEXT,
  "permissionSetId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FieldPermission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "FieldPermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE,
  CONSTRAINT "FieldPermission_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FieldPermission_org_holder_object_field_idx"
  ON "FieldPermission" ("orgId", "holderType", "holderId", "object", "field");
CREATE INDEX IF NOT EXISTS "FieldPermission_profile_idx"
  ON "FieldPermission" ("profileId");
CREATE INDEX IF NOT EXISTS "FieldPermission_permission_set_idx"
  ON "FieldPermission" ("permissionSetId");

-- Manual record-level shares
CREATE TABLE IF NOT EXISTS "RecordShare" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "object" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "granteeType" "ShareGranteeType" NOT NULL,
  "granteeId" TEXT NOT NULL,
  "access" "ShareAccess" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "RecordShare_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecordShare_org_object_record_idx"
  ON "RecordShare" ("orgId", "object", "recordId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Team' AND column_name = 'orgId'
  ) THEN
    ALTER TABLE "Team" ADD COLUMN "orgId" TEXT;
    UPDATE "Team" t
      SET "orgId" = (
        SELECT "organizationId" FROM "Tenant" tenant WHERE tenant."id" = t."tenantId"
      )
      WHERE "orgId" IS NULL;
    ALTER TABLE "Team"
      ALTER COLUMN "orgId" SET NOT NULL;
    ALTER TABLE "Team"
      ADD CONSTRAINT "Team_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "Team_orgId_idx" ON "Team" ("orgId");

-- Audit trail
CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "actorId" TEXT,
  "object" TEXT,
  "recordId" TEXT,
  "action" "AuditAction" NOT NULL,
  "diff" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "AuditEvent_org_object_record_idx"
  ON "AuditEvent" ("orgId", "object", "recordId");

-- Backfill helper: ensure existing users default to active
UPDATE "User" SET "status" = 'active' WHERE "status" IS NULL;

-- Timestamp triggers to maintain updatedAt columns for membership / permission tables
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_user_org_membership') THEN
    DROP TRIGGER set_updated_at_user_org_membership ON "UserOrgMembership";
  END IF;
END$$;
CREATE TRIGGER set_updated_at_user_org_membership
BEFORE UPDATE ON "UserOrgMembership"
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_role') THEN
    DROP TRIGGER set_updated_at_role ON "Role";
  END IF;
END$$;
CREATE TRIGGER set_updated_at_role
BEFORE UPDATE ON "Role"
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_profile') THEN
    DROP TRIGGER set_updated_at_profile ON "Profile";
  END IF;
END$$;
CREATE TRIGGER set_updated_at_profile
BEFORE UPDATE ON "Profile"
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_permission_set') THEN
    DROP TRIGGER set_updated_at_permission_set ON "PermissionSet";
  END IF;
END$$;
CREATE TRIGGER set_updated_at_permission_set
BEFORE UPDATE ON "PermissionSet"
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_object_permission') THEN
    DROP TRIGGER set_updated_at_object_permission ON "ObjectPermission";
  END IF;
END$$;
CREATE TRIGGER set_updated_at_object_permission
BEFORE UPDATE ON "ObjectPermission"
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_field_permission') THEN
    DROP TRIGGER set_updated_at_field_permission ON "FieldPermission";
  END IF;
END$$;
CREATE TRIGGER set_updated_at_field_permission
BEFORE UPDATE ON "FieldPermission"
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

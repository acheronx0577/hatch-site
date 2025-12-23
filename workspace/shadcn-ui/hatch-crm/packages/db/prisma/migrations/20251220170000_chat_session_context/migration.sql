-- CreateEnum
CREATE TYPE "ChatContextType" AS ENUM ('GENERAL', 'LEAD', 'LISTING', 'TRANSACTION', 'LEGACY');

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "contextType" "ChatContextType";
ALTER TABLE "ChatSession" ADD COLUMN "contextId" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "contextKey" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "contextSnapshot" JSONB;

-- Backfill legacy sessions so we can safely enforce uniqueness going forward.
UPDATE "ChatSession"
SET
  "contextType" = 'LEGACY'::"ChatContextType",
  "contextKey" = 'LEGACY:' || "id"
WHERE "contextKey" IS NULL;

ALTER TABLE "ChatSession" ALTER COLUMN "contextType" SET NOT NULL;
ALTER TABLE "ChatSession" ALTER COLUMN "contextType" SET DEFAULT 'LEGACY';
ALTER TABLE "ChatSession" ALTER COLUMN "contextKey" SET NOT NULL;

-- Indexes
CREATE UNIQUE INDEX "ChatSession_organizationId_userId_contextKey_key" ON "ChatSession"("organizationId", "userId", "contextKey");
CREATE INDEX "ChatSession_organizationId_userId_contextType_contextId_idx" ON "ChatSession"("organizationId", "userId", "contextType", "contextId");

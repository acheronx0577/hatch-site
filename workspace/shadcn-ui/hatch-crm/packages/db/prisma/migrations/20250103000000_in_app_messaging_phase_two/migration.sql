-- Extend message channel and status enums for in-app messaging
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'IN_APP';
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'READ';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MESSAGE_READ';

-- Conversation domain enums
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ConversationType'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "public"."ConversationType" AS ENUM ('EXTERNAL', 'INTERNAL');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ConversationParticipantRole'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "public"."ConversationParticipantRole" AS ENUM ('OWNER', 'MEMBER', 'VIEWER');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'MessageReceiptStatus'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "public"."MessageReceiptStatus" AS ENUM ('DELIVERED', 'READ');
  END IF;
END$$;

-- Tenant retention setting for in-app messaging
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "inAppRetentionMonths" INTEGER NOT NULL DEFAULT 18;

-- Conversations table
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "type" "ConversationType" NOT NULL,
  "personId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMPTZ,
  CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Conversation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Conversation_tenant_type_idx"
  ON "Conversation" ("tenantId", "type");

CREATE INDEX IF NOT EXISTS "Conversation_tenant_person_idx"
  ON "Conversation" ("tenantId", "personId");

CREATE INDEX IF NOT EXISTS "Conversation_tenant_updated_idx"
  ON "Conversation" ("tenantId", "updatedAt");

-- Conversation participants table
CREATE TABLE IF NOT EXISTS "ConversationParticipant" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT,
  "personId" TEXT,
  "role" "ConversationParticipantRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "muted" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastReadAt" TIMESTAMPTZ,
  CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConversationParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversation_role_idx"
  ON "ConversationParticipant" ("conversationId", "role");

CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversation_user_idx"
  ON "ConversationParticipant" ("conversationId", "userId");

CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversation_person_idx"
  ON "ConversationParticipant" ("conversationId", "personId");

-- Message attachments for in-app messaging
CREATE TABLE IF NOT EXISTS "MessageAttachment" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "checksum" TEXT,
  "scanned" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MessageAttachment_messageId_idx"
  ON "MessageAttachment" ("messageId");

CREATE INDEX IF NOT EXISTS "MessageAttachment_checksum_idx"
  ON "MessageAttachment" ("checksum");

-- Message receipts for delivery/read tracking
CREATE TABLE IF NOT EXISTS "MessageReceipt" (
  "id" TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "status" "MessageReceiptStatus" NOT NULL,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageReceipt_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ConversationParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageReceipt_message_participant_status_key" UNIQUE ("messageId", "participantId", "status")
);

CREATE INDEX IF NOT EXISTS "MessageReceipt_participant_status_idx"
  ON "MessageReceipt" ("participantId", "status");

-- Message table updates for in-app channel
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "conversationId" TEXT;

ALTER TABLE "Message"
  ALTER COLUMN "toAddress" DROP NOT NULL,
  ALTER COLUMN "fromAddress" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'Message'
      AND constraint_name = 'Message_conversationId_fkey'
  ) THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "Message_conversationId_idx"
  ON "Message" ("conversationId");

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BROKER', 'TEAM_LEAD', 'AGENT', 'ISA', 'MARKETING', 'LENDER', 'CONSUMER');

-- CreateEnum
CREATE TYPE "PersonStage" AS ENUM ('NEW', 'NURTURE', 'ACTIVE', 'UNDER_CONTRACT', 'CLOSED', 'LOST');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('EMAIL', 'SMS', 'VOICE');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('PROMOTIONAL', 'TRANSACTIONAL');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('COMING_SOON', 'ACTIVE', 'PENDING', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TourStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'KEPT', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('BUYER_REP', 'LISTING');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'SIGNED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('OFFER', 'UNDER_CONTRACT', 'CLOSED', 'LOST');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS', 'VOICE', 'IN_APP');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'BLOCKED', 'READ');

-- CreateEnum
CREATE TYPE "AgentInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "CampaignEnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutreachEventStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OrgEventType" AS ENUM ('ORG_CREATED', 'BROKER_CREATED_ORG', 'AGENT_INVITE_CREATED', 'AGENT_INVITE_ACCEPTED', 'ORG_FOLDER_CREATED', 'ORG_FILE_UPLOADED', 'ORG_FILE_CLASSIFIED', 'ORG_FILE_EVALUATED', 'ORG_LISTING_EVALUATED', 'ORG_TRANSACTION_EVALUATED', 'ONBOARDING_TEMPLATE_CREATED', 'ONBOARDING_TASK_GENERATED', 'ONBOARDING_TASK_COMPLETED', 'OFFBOARDING_TASK_GENERATED', 'OFFBOARDING_TASK_COMPLETED', 'ORG_LEAD_CREATED', 'ORG_LEAD_STATUS_CHANGED', 'ORG_OFFER_INTENT_CREATED', 'ORG_OFFER_INTENT_STATUS_CHANGED', 'ORG_RENTAL_PROPERTY_CREATED', 'ORG_RENTAL_LEASE_CREATED', 'ORG_ACCOUNTING_CONNECTED', 'ORG_ACCOUNTING_TRANSACTION_SYNCED', 'ORG_ACCOUNTING_RENTAL_SYNCED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('GENERIC', 'LEAD', 'OFFER_INTENT', 'LISTING', 'TRANSACTION', 'RENTAL', 'COMPLIANCE', 'ACCOUNTING', 'AI');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('BROKER', 'TEAM', 'AGENT', 'LISTING', 'TRANSACTION', 'LEAD', 'RENTAL', 'COMPLIANCE', 'RISK', 'PRODUCTIVITY');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('LOGIN', 'LOGOUT', 'ROLE_CHANGED', 'MLS_SYNC_TRIGGERED', 'ACCOUNTING_SYNC_TRIGGERED', 'NOTIFICATION_PREFS_UPDATED', 'AI_PERSONA_RUN', 'AI_PERSONA_CONFIG_CHANGED', 'ONBOARDING_STATE_CHANGED', 'OFFBOARDING_STATE_CHANGED', 'COMPLIANCE_STATUS_CHANGED', 'OTHER');

-- CreateEnum
CREATE TYPE "AgentRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AgentMembershipType" AS ENUM ('MLS', 'BOARD', 'NAR', 'OTHER');

-- CreateEnum
CREATE TYPE "AgentMembershipStatus" AS ENUM ('ACTIVE', 'PENDING', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgentTrainingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AgentLifecycleStage" AS ENUM ('ONBOARDING', 'ACTIVE', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkflowTaskTrigger" AS ENUM ('MANUAL', 'AGENT_INVITE_ACCEPTED', 'CE_INCOMPLETE', 'MEMBERSHIP_EXPIRED', 'AI_HIGH_RISK');

-- CreateEnum
CREATE TYPE "OrgListingStatus" AS ENUM ('DRAFT', 'PENDING_BROKER_APPROVAL', 'ACTIVE', 'PENDING', 'CLOSED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrgTransactionStatus" AS ENUM ('PRE_CONTRACT', 'UNDER_CONTRACT', 'CONTINGENT', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrgListingDocumentType" AS ENUM ('LISTING_AGREEMENT', 'DISCLOSURE', 'PHOTOS', 'OTHER');

-- CreateEnum
CREATE TYPE "OrgTransactionDocumentType" AS ENUM ('EXECUTED_CONTRACT', 'ADDENDUM', 'INSPECTION_REPORT', 'APPRAISAL', 'CLOSING_DISCLOSURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractInstanceStatus" AS ENUM ('DRAFT', 'OUT_FOR_SIGNATURE', 'SIGNED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SignatureEnvelopeStatus" AS ENUM ('CREATED', 'SENT', 'COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ContractFieldSourceType" AS ENUM ('PROPERTY', 'PARTY', 'BROKERAGE', 'ORG', 'STATIC');

-- CreateEnum
CREATE TYPE "OrgConversationType" AS ENUM ('DIRECT', 'CHANNEL');

-- CreateEnum
CREATE TYPE "OrgChannelVisibility" AS ENUM ('ORG_WIDE', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('EXTERNAL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('OWNER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "MessageReceiptStatus" AS ENUM ('DELIVERED', 'READ');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LEAD_CREATED', 'CONSENT_CAPTURED', 'CONSENT_REVOKED', 'TOUR_REQUESTED', 'TOUR_CONFIRMED', 'TOUR_KEPT', 'AGREEMENT_SIGNED', 'DEAL_STAGE_CHANGED', 'MESSAGE_SENT', 'MESSAGE_READ', 'MESSAGE_FAILED', 'MESSAGE_BLOCKED', 'COMPLIANCE_VIOLATION', 'ROUTING_ASSIGNED', 'CONTACT_MERGE_PROPOSED', 'CONTACT_MERGED', 'CONTACT_EMAIL_CHANGED', 'CONTACT_PHONE_CHANGED', 'CONTACT_STAGE_CHANGED', 'CONTACT_OWNER_CHANGED', 'CONTACT_TAGS_CHANGED', 'CONTACT_DELETED', 'CONTACT_RESTORED', 'NOTE_ADDED', 'COMMISSION_PLAN_CREATED', 'COMMISSION_PLAN_UPDATED', 'COMMISSION_PLAN_ARCHIVED', 'COMMISSION_PLAN_ASSIGNED', 'COMMISSION_PLAN_ASSIGNMENT_ENDED', 'CAP_LEDGER_UPDATED');

-- CreateEnum
CREATE TYPE "RoutingMode" AS ENUM ('FIRST_MATCH', 'SCORE_AND_ASSIGN');

-- CreateEnum
CREATE TYPE "LeadSlaType" AS ENUM ('FIRST_TOUCH', 'KEPT_APPOINTMENT');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DELIVERING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadHistoryEventType" AS ENUM ('STAGE_MOVED', 'OWNER_ASSIGNED', 'OWNER_UNASSIGNED', 'TOUCHPOINT_LOGGED', 'NOTE_ADDED', 'FILE_ATTACHED', 'FIELD_UPDATED', 'JOURNEY_STARTED');

-- CreateEnum
CREATE TYPE "QueueVisibility" AS ENUM ('PRIVATE', 'TEAM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'PORTAL', 'OPEN_HOUSE', 'API', 'REFERRAL');

-- CreateEnum
CREATE TYPE "BuyerRepStatus" AS ENUM ('ACTIVE', 'NONE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LeadScoreTier" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "LeadTaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "LeadTouchpointType" AS ENUM ('MESSAGE', 'CALL', 'MEETING', 'TASK', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'APPOINTMENT_SET', 'UNDER_CONTRACT', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('PORTAL_SIGNUP', 'LISTING_INQUIRY', 'LOI_SUBMISSION', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "OfferIntentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RentalPropertyType" AS ENUM ('SINGLE_FAMILY', 'CONDO', 'MULTI_FAMILY', 'COMMERCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalTenancyType" AS ENUM ('SEASONAL', 'ANNUAL', 'MONTH_TO_MONTH', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNDER_MGMT', 'OFF_MGMT');

-- CreateEnum
CREATE TYPE "RentalUnitStatus" AS ENUM ('VACANT', 'OCCUPIED', 'RESERVED');

-- CreateEnum
CREATE TYPE "RentalTaxStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "MlsProvider" AS ENUM ('STELLAR', 'NABOR', 'MATRIX', 'GENERIC');

-- CreateEnum
CREATE TYPE "MlsSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SavedSearchFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "AiCopilotInsightType" AS ENUM ('DAILY_BRIEFING', 'LEAD_FOLLOWUP_SUMMARY', 'PIPELINE_OVERVIEW');

-- CreateEnum
CREATE TYPE "AiCopilotActionStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'DISMISSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AccountingProvider" AS ENUM ('QUICKBOOKS');

-- CreateEnum
CREATE TYPE "AccountingSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PermissionHolderType" AS ENUM ('PROFILE', 'PERMISSION_SET');

-- CreateEnum
CREATE TYPE "ShareGranteeType" AS ENUM ('USER', 'ROLE', 'TEAM');

-- CreateEnum
CREATE TYPE "ShareAccess" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SHARE', 'LOGIN');

-- CreateEnum
CREATE TYPE "AssignmentReasonType" AS ENUM ('CAPACITY', 'PERFORMANCE', 'GEOGRAPHY', 'PRICE_BAND', 'CONSENT', 'TEN_DLC', 'ROUND_ROBIN', 'TEAM_POND');

-- CreateEnum
CREATE TYPE "CommissionPlanType" AS ENUM ('FLAT', 'TIERED', 'CAP');

-- CreateEnum
CREATE TYPE "PlanAssigneeType" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "ClearCooperationStatus" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "JourneyTrigger" AS ENUM ('LEAD_CREATED', 'CONSENT_CAPTURED', 'TOUR_KEPT', 'DEAL_STAGE_CHANGED');

-- CreateEnum
CREATE TYPE "JourneyActionType" AS ENUM ('ASSIGN', 'SEND_MESSAGE', 'CREATE_TASK', 'UPDATE_STAGE');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('SHOWING', 'MEETING', 'INSPECTION', 'CLOSING', 'FOLLOW_UP', 'MARKETING', 'OTHER');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarEventPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SavedViewScope" AS ENUM ('PRIVATE', 'TEAM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('CONTACT', 'DEAL');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT');

-- CreateEnum
CREATE TYPE "SequenceEnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SequenceStepStatus" AS ENUM ('PENDING', 'SCHEDULED', 'SENT', 'SKIPPED', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "OrgFileCategory" AS ENUM ('CONTRACT_TEMPLATE', 'COMPLIANCE', 'TRAINING', 'MARKETING', 'RENTAL_PM', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('UNKNOWN', 'LISTING_CONTRACT', 'PURCHASE_CONTRACT', 'LOI', 'ADDENDUM', 'DISCLOSURE', 'INSPECTION', 'PROOF_OF_FUNDS', 'CLOSING_DOC', 'RENTAL_AGREEMENT', 'TAX_DOC');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('NONE', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('UNKNOWN', 'PENDING', 'PASSED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "PlaybookTriggerType" AS ENUM ('LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_SCORE_UPDATED', 'LEAD_CONVERSION_HIGH', 'LEAD_CONVERSION_LOW', 'LISTING_CREATED', 'LISTING_UPDATED', 'DOCUMENT_EVALUATED', 'TRANSACTION_UPDATED', 'RENTAL_UPDATED', 'MLS_SYNC_COMPLETED', 'ACCOUNTING_SYNC_FAILED', 'AGENT_NONCOMPLIANT');

-- CreateEnum
CREATE TYPE "PlaybookActionType" AS ENUM ('CREATE_TASK', 'SEND_NOTIFICATION', 'SEND_EMAIL', 'ASSIGN_LEAD', 'FLAG_ENTITY', 'START_PLAYBOOK', 'UPDATE_ENTITY_STATUS', 'RUN_AI_PERSONA');

-- CreateEnum
CREATE TYPE "AnalyticsGranularity" AS ENUM ('DAILY');

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT DEFAULT 'standard',
    "slug" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "city" TEXT,
    "state" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "quietHoursStart" INTEGER NOT NULL DEFAULT 21,
    "quietHoursEnd" INTEGER NOT NULL DEFAULT 8,
    "inAppRetentionMonths" INTEGER NOT NULL DEFAULT 18,
    "tenDlcReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEmployeeTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "allowedTools" JSONB NOT NULL,
    "defaultSettings" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEmployeeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEmployeeInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "nameOverride" TEXT,
    "settings" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "autoMode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEmployeeInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEmployeeSession" (
    "id" TEXT NOT NULL,
    "employeeInstanceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "contextType" TEXT,
    "contextId" TEXT,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEmployeeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProposedAction" (
    "id" TEXT NOT NULL,
    "employeeInstanceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "executedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProposedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExecutionLog" (
    "id" TEXT NOT NULL,
    "employeeInstanceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "proposedActionId" TEXT,
    "toolKey" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "modelName" TEXT,
    "rawPromptTokens" INTEGER,
    "rawCompletionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'GENERIC',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "leadId" TEXT,
    "offerIntentId" TEXT,
    "listingId" TEXT,
    "transactionId" TEXT,
    "leaseId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "leadNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "offerIntentNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rentalNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "accountingNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "actionType" "AuditActionType" NOT NULL DEFAULT 'OTHER',
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT,
    "text" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScoreV2" (
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScoreV2_pkey" PRIMARY KEY ("leadId")
);

-- CreateTable
CREATE TABLE "VectorChunk" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding_f8" DOUBLE PRECISION[],
    "embedding_v" vector,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VectorChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "officeId" TEXT,
    "teamId" TEXT,
    "email" CITEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "avatarUrl" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgListing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "officeId" TEXT,
    "agentProfileId" TEXT,
    "mlsNumber" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT,
    "listPrice" INTEGER,
    "propertyType" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "squareFeet" INTEGER,
    "status" "OrgListingStatus" NOT NULL DEFAULT 'DRAFT',
    "brokerApproved" BOOLEAN NOT NULL DEFAULT false,
    "brokerApprovedAt" TIMESTAMP(3),
    "brokerApprovedByUserId" TEXT,
    "listedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgListingDocument" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "orgFileId" TEXT NOT NULL,
    "type" "OrgListingDocumentType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgListingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "officeId" TEXT,
    "listingId" TEXT,
    "agentProfileId" TEXT,
    "status" "OrgTransactionStatus" NOT NULL DEFAULT 'PRE_CONTRACT',
    "contractSignedAt" TIMESTAMP(3),
    "inspectionDate" TIMESTAMP(3),
    "financingDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "buyerName" TEXT,
    "sellerName" TEXT,
    "isCompliant" BOOLEAN NOT NULL DEFAULT true,
    "requiresAction" BOOLEAN NOT NULL DEFAULT false,
    "complianceNotes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgTransactionDocument" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "orgFileId" TEXT NOT NULL,
    "type" "OrgTransactionDocumentType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgTransactionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "jurisdiction" TEXT,
    "propertyType" TEXT,
    "side" TEXT,
    "s3Key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractFieldMapping" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateFieldKey" TEXT NOT NULL,
    "sourceType" "ContractFieldSourceType" NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "defaultValue" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractInstance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT,
    "orgListingId" TEXT,
    "orgTransactionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ContractInstanceStatus" NOT NULL DEFAULT 'DRAFT',
    "draftS3Key" TEXT,
    "signedS3Key" TEXT,
    "fieldValues" JSONB NOT NULL,
    "recommendationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureEnvelope" (
    "id" TEXT NOT NULL,
    "contractInstanceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEnvelopeId" TEXT NOT NULL,
    "status" "SignatureEnvelopeStatus" NOT NULL DEFAULT 'CREATED',
    "signers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" "OrgConversationType" NOT NULL,
    "name" TEXT,
    "visibility" "OrgChannelVisibility" DEFAULT 'ORG_WIDE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "officeId" TEXT,
    "teamId" TEXT,
    "licenseNumber" TEXT,
    "licenseState" TEXT,
    "licenseExpiresAt" TIMESTAMP(3),
    "isCommercial" BOOLEAN NOT NULL DEFAULT false,
    "isResidential" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "bio" TEXT,
    "tags" TEXT,
    "metadata" JSONB,
    "isCompliant" BOOLEAN NOT NULL DEFAULT true,
    "requiresAction" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" "AgentRiskLevel" NOT NULL DEFAULT 'LOW',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskFlags" JSONB,
    "lifecycleStage" "AgentLifecycleStage" NOT NULL DEFAULT 'ONBOARDING',
    "ceCycleStartAt" TIMESTAMP(3),
    "ceCycleEndAt" TIMESTAMP(3),
    "ceHoursRequired" INTEGER,
    "ceHoursCompleted" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMembership" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "type" "AgentMembershipType" NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "AgentMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCERecord" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "provider" TEXT,
    "courseName" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "certificateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCERecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTrainingModule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orgFileId" TEXT,
    "externalUrl" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "estimatedMinutes" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTrainingProgress" (
    "id" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "status" "AgentTrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "score" INTEGER,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgWorkflowTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "WorkflowType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgWorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgWorkflowTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedToRole" TEXT,
    "trainingModuleId" TEXT,
    "orgFileId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgWorkflowTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWorkflowTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "officeId" TEXT,
    "agentProfileId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateTaskId" TEXT,
    "type" "WorkflowType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedToRole" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "WorkflowTaskTrigger" NOT NULL DEFAULT 'MANUAL',
    "triggerSource" TEXT,
    "listingId" TEXT,
    "transactionId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "leadId" TEXT,
    "consumerId" TEXT,
    "status" "OfferIntentStatus" NOT NULL DEFAULT 'DRAFT',
    "offeredPrice" INTEGER,
    "financingType" TEXT,
    "closingTimeline" TEXT,
    "contingencies" TEXT,
    "comments" TEXT,
    "transactionId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalProperty" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT,
    "propertyType" "RentalPropertyType" NOT NULL DEFAULT 'SINGLE_FAMILY',
    "status" "RentalStatus" NOT NULL DEFAULT 'UNDER_MGMT',
    "ownerName" TEXT,
    "ownerContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalUnit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "squareFeet" INTEGER,
    "status" "RentalUnitStatus" NOT NULL DEFAULT 'VACANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalLease" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "officeId" TEXT,
    "unitId" TEXT NOT NULL,
    "tenancyType" "RentalTenancyType" NOT NULL DEFAULT 'SEASONAL',
    "tenantName" TEXT NOT NULL,
    "tenantContact" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "rentAmount" INTEGER,
    "transactionId" TEXT,
    "requiresTaxFiling" BOOLEAN NOT NULL DEFAULT false,
    "isCompliant" BOOLEAN NOT NULL DEFAULT true,
    "complianceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalTaxSchedule" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountDue" INTEGER,
    "status" "RentalTaxStatus" NOT NULL DEFAULT 'PENDING',
    "paidDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalTaxSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlsFeedConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "MlsProvider" NOT NULL DEFAULT 'GENERIC',
    "officeCode" TEXT,
    "brokerId" TEXT,
    "boardName" TEXT,
    "boardUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFullSyncAt" TIMESTAMP(3),
    "lastIncrementalSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MlsFeedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlsSyncRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "MlsProvider" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "MlsSyncStatus" NOT NULL DEFAULT 'PENDING',
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "totalUpserted" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MlsSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSearchIndex" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT,
    "mlsNumber" TEXT,
    "mlsProvider" "MlsProvider",
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT,
    "propertyType" TEXT,
    "listPrice" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "squareFeet" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRental" BOOLEAN NOT NULL DEFAULT false,
    "searchText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingSearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedListing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "searchIndexId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "SavedSearchFrequency" NOT NULL DEFAULT 'INSTANT',
    "lastRunAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearchAlertEvent" (
    "id" TEXT NOT NULL,
    "savedSearchId" TEXT NOT NULL,
    "matchCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearchAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCopilotInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "type" "AiCopilotInsightType" NOT NULL DEFAULT 'DAILY_BRIEFING',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCopilotInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCopilotActionRecommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "leadId" TEXT,
    "orgListingId" TEXT,
    "orgTransactionId" TEXT,
    "leaseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AiCopilotActionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "priority" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,

    CONSTRAINT "AiCopilotActionRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingIntegrationConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS',
    "realmId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionAccountingRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS',
    "externalId" TEXT,
    "syncStatus" "AccountingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionAccountingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalLeaseAccountingRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS',
    "externalId" TEXT,
    "syncStatus" "AccountingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalLeaseAccountingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "tokensJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "officeId" TEXT,
    "consumerId" TEXT,
    "listingId" TEXT,
    "agentProfileId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL DEFAULT 'PORTAL_SIGNUP',
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "desiredMoveIn" TIMESTAMP(3),
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "aiScore" DOUBLE PRECISION,
    "conversionLikelihood" DOUBLE PRECISION,
    "lastAiScoreAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScoreHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "aiScore" DOUBLE PRECISION NOT NULL,
    "likelihood" DOUBLE PRECISION NOT NULL,
    "reasonSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DripCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DripCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DripStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "offsetHours" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DripStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueForecast" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "forecast30Days" DOUBLE PRECISION NOT NULL,
    "forecast60Days" DOUBLE PRECISION NOT NULL,
    "forecast90Days" DOUBLE PRECISION NOT NULL,
    "totalPending" DOUBLE PRECISION NOT NULL,
    "totalActive" DOUBLE PRECISION NOT NULL,
    "totalLost" DOUBLE PRECISION NOT NULL,
    "assumptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgFolder" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgFile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tenantId" TEXT,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "OrgFileCategory" NOT NULL DEFAULT 'OTHER',
    "documentType" "DocumentType" NOT NULL DEFAULT 'UNKNOWN',
    "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'NONE',
    "fileId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "listingId" TEXT,
    "transactionId" TEXT,
    "leaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgFileVersion" (
    "id" TEXT NOT NULL,
    "orgFileId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "OrgFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orgFileId" TEXT,
    "title" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgFileComment" (
    "id" TEXT NOT NULL,
    "orgFileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgFileComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "leadsWorked" INTEGER NOT NULL DEFAULT 0,
    "leadsConverted" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTimeSec" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksOverdue" INTEGER NOT NULL DEFAULT 0,
    "documentsIssues" INTEGER NOT NULL DEFAULT 0,
    "compliantDocs" INTEGER NOT NULL DEFAULT 0,
    "listingsActive" INTEGER NOT NULL DEFAULT 0,
    "transactionsActive" INTEGER NOT NULL DEFAULT 0,
    "activityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "performanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "responsivenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchVector" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchVector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivePresence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LivePresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookTrigger" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "type" "PlaybookTriggerType" NOT NULL,
    "conditions" JSONB,

    CONSTRAINT "PlaybookTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookAction" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "type" "PlaybookActionType" NOT NULL,
    "params" JSONB,

    CONSTRAINT "PlaybookAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRun" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "triggerType" "PlaybookTriggerType" NOT NULL,
    "actionSummary" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "listingId" TEXT,
    "leadId" TEXT,
    "transactionId" TEXT,
    "leaseId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PlaybookRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT,
    "type" "OrgEventType" NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "AgentInviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officeId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "org_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'Agent',
    "status" TEXT NOT NULL DEFAULT 'active',
    "experience_years" INTEGER,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "deals_in_progress" INTEGER NOT NULL DEFAULT 0,
    "open_leads" INTEGER NOT NULL DEFAULT 0,
    "response_time_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegatedAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "canManageListings" BOOLEAN NOT NULL DEFAULT true,
    "canManageLeads" BOOLEAN NOT NULL DEFAULT true,
    "canManageTransactions" BOOLEAN NOT NULL DEFAULT true,
    "canManageRentals" BOOLEAN NOT NULL DEFAULT true,
    "canManageTasks" BOOLEAN NOT NULL DEFAULT true,
    "canViewFinancials" BOOLEAN NOT NULL DEFAULT false,
    "canChangeCompliance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegatedAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "primaryEmail" TEXT,
    "secondaryEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primaryPhone" TEXT,
    "secondaryPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stage" "PersonStage" NOT NULL DEFAULT 'NEW',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "companyId" TEXT,
    "householdId" TEXT,
    "householdRole" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "gclid" TEXT,
    "address" TEXT,
    "leadScore" DOUBLE PRECISION,
    "buyerRepStatus" "BuyerRepStatus" NOT NULL DEFAULT 'NONE',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMP(3),
    "preferredChannels" "ConsentChannel"[] DEFAULT ARRAY[]::"ConsentChannel"[],
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pipelineId" TEXT,
    "stageId" TEXT,
    "stageEnteredAt" TIMESTAMP(3),
    "scoreTier" "LeadScoreTier" NOT NULL DEFAULT 'D',
    "scoreUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "industry" TEXT,
    "type" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "size" TEXT,
    "primaryContactId" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT,
    "timezone" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brokerageId" TEXT,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "useCase" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "PipelineStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "probWin" INTEGER,
    "slaMinutes" INTEGER,
    "slaHours" INTEGER,
    "exitReasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldSet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "uiSchema" JSONB,
    "visibility" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineAutomation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT,
    "trigger" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadFit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "preapproved" BOOLEAN NOT NULL DEFAULT false,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "timeframeDays" INTEGER,
    "geo" TEXT,
    "inventoryMatch" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadFit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "anonymousId" TEXT,
    "name" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "properties" JSONB,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivityRollup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "last7dListingViews" INTEGER NOT NULL DEFAULT 0,
    "last7dSessions" INTEGER NOT NULL DEFAULT 0,
    "lastReplyAt" TIMESTAMP(3),
    "lastEmailOpenAt" TIMESTAMP(3),
    "lastTouchpointAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadActivityRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadTouchpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "LeadTouchpointType" NOT NULL,
    "channel" "MessageChannel",
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadTouchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "LeadTaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventType" "LeadHistoryEventType" NOT NULL,
    "actorId" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "properties" JSONB,
    "sourceIp" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "source" TEXT,
    "reason" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Touchpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "conversationId" TEXT,
    "actorId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "subject" TEXT,
    "preview" TEXT,
    "body" TEXT,
    "providerId" TEXT,
    "providerMeta" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "SavedViewScope" NOT NULL DEFAULT 'PRIVATE',
    "teamId" TEXT,
    "description" TEXT,
    "columns" JSONB,
    "sort" JSONB,
    "filters" JSONB NOT NULL,
    "query" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brokerageId" TEXT,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "filters" JSONB,
    "sort" JSONB,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewPresetShareToken" (
    "id" TEXT NOT NULL,
    "viewPresetId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewPresetShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerPortalConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brokerageId" TEXT,
    "modules" JSONB NOT NULL,
    "fields" JSONB,
    "viewPresetId" TEXT,
    "permissions" JSONB,
    "branding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumerPortalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" JSONB NOT NULL,
    "throttlePerDay" INTEGER,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" "SequenceEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRunAt" TIMESTAMP(3),
    "lastExecutedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStepLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepPayload" JSONB,
    "channel" "MessageChannel",
    "status" "SequenceStepStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "messageId" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceStepLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "delayHours" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "CampaignEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStepSent" INTEGER,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "status" "OutreachEventStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entity" "CustomFieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "description" TEXT,
    "placeholder" TEXT,
    "helpText" TEXT,
    "options" JSONB,
    "defaultValue" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "personId" TEXT,
    "dealId" TEXT,
    "value" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldLayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" "CustomFieldEntity" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMergeProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "existingPersonId" TEXT NOT NULL,
    "incomingPayload" JSONB NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "status" "MergeStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionPayload" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMergeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "verbatimText" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "evidenceUri" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "opportunityId" TEXT,
    "mlsId" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'COMING_SOON',
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'USA',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "price" DECIMAL(65,30),
    "beds" INTEGER,
    "baths" DOUBLE PRECISION,
    "propertyType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "eventType" "CalendarEventType" NOT NULL DEFAULT 'OTHER',
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "CalendarEventPriority" NOT NULL DEFAULT 'MEDIUM',
    "location" TEXT,
    "notes" TEXT,
    "assignedAgentId" TEXT,
    "personId" TEXT,
    "listingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "agentId" TEXT,
    "status" "TourStatus" NOT NULL DEFAULT 'REQUESTED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "routingScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "documentUri" TEXT,
    "signatureLog" JSONB,
    "signedAt" TIMESTAMP(3),
    "overrideUserId" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "companyId" TEXT,
    "listingId" TEXT,
    "agreementId" TEXT,
    "opportunityId" TEXT,
    "stage" "DealStage" NOT NULL DEFAULT 'OFFER',
    "forecastGci" DECIMAL(65,30),
    "actualGci" DECIMAL(65,30),
    "splitPlanRef" TEXT,
    "spendToDate" DECIMAL(65,30) DEFAULT 0,
    "expectedNet" DECIMAL(65,30),
    "commissionSnapshot" JSONB,
    "milestoneChecklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "dealId" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "terms" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MLSProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "disclaimerText" TEXT NOT NULL,
    "compensationDisplayRule" TEXT NOT NULL,
    "requiredPlacement" TEXT DEFAULT 'footer',
    "prohibitedFields" JSONB,
    "clearCooperationRequired" BOOLEAN NOT NULL DEFAULT true,
    "slaHours" INTEGER NOT NULL DEFAULT 72,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MLSProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourAgreementLink" (
    "tourId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourAgreementLink_pkey" PRIMARY KEY ("tourId")
);

-- CreateTable
CREATE TABLE "DisclaimerPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mlsProfileId" TEXT NOT NULL,
    "requiredText" TEXT NOT NULL,
    "requiredPlacement" TEXT NOT NULL,
    "compensationRule" TEXT NOT NULL,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisclaimerPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverrideLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "context" TEXT NOT NULL,
    "reasonText" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverrideLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT,
    "mlsProfileId" TEXT,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT,
    "metadata" JSONB,

    CONSTRAINT "MarketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT,
    "personaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'EMAIL',
    "audienceKey" TEXT,
    "audienceLabel" TEXT,
    "callToAction" TEXT,
    "recipientsCount" INTEGER NOT NULL DEFAULT 0,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceStatusDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT,
    "agentId" TEXT,
    "toursTotal" INTEGER NOT NULL DEFAULT 0,
    "toursKept" INTEGER NOT NULL DEFAULT 0,
    "keptWithActiveBba" INTEGER NOT NULL DEFAULT 0,
    "smsGranted" INTEGER NOT NULL DEFAULT 0,
    "smsRevoked" INTEGER NOT NULL DEFAULT 0,
    "emailGranted" INTEGER NOT NULL DEFAULT 0,
    "emailRevoked" INTEGER NOT NULL DEFAULT 0,
    "coopOpen" INTEGER NOT NULL DEFAULT 0,
    "coopOverdue" INTEGER NOT NULL DEFAULT 0,
    "idxFailures" INTEGER NOT NULL DEFAULT 0,
    "idxChecks" INTEGER NOT NULL DEFAULT 0,
    "tenDlcApproved" BOOLEAN NOT NULL DEFAULT false,
    "dmarcAligned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceStatusDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommissionPlanType" NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "postCapFee" JSONB,
    "bonusRules" JSONB,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assigneeType" "PlanAssigneeType" NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "capAmount" DECIMAL(12,2) NOT NULL,
    "companyDollarYtd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "postCapFeesYtd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastDealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "PlanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "mode" "RoutingMode" NOT NULL DEFAULT 'FIRST_MATCH',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "targets" JSONB NOT NULL,
    "fallback" JSONB,
    "slaFirstTouchMinutes" INTEGER,
    "slaKeptAppointmentMinutes" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadRouteEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "personId" TEXT,
    "matchedRuleId" TEXT,
    "mode" "RoutingMode" NOT NULL,
    "payload" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "assignedAgentId" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "reasonCodes" JSONB,
    "slaDueAt" TIMESTAMP(3),
    "slaSatisfiedAt" TIMESTAMP(3),
    "slaBreachedAt" TIMESTAMP(3),
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadRouteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "routingMode" "RoutingMode" NOT NULL DEFAULT 'FIRST_MATCH',
    "visibility" "QueueVisibility" NOT NULL DEFAULT 'ORGANIZATION',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slaMinutes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "breachReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSlaTimer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignedAgentId" TEXT,
    "ruleId" TEXT,
    "type" "LeadSlaType" NOT NULL DEFAULT 'FIRST_TOUCH',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "satisfiedAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSlaTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "userId" TEXT,
    "conversationId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "toAddress" TEXT,
    "fromAddress" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "deliveredAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL,
    "personId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "personId" TEXT,
    "role" "ConversationParticipantRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "status" "MessageReceiptStatus" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "scanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "userId" TEXT,
    "dealId" TEXT,
    "tourId" TEXT,
    "agreementId" TEXT,
    "listingId" TEXT,
    "type" "ActivityType" NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "agentId" TEXT,
    "teamId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentReason" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "type" "AssignmentReasonType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "AssignmentReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "JourneyTrigger" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneySimulation" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneySimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "channel" "ConsentChannel" NOT NULL,
    "scope" "ConsentScope",
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClearCooperationTimer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT,
    "mlsProfileId" TEXT,
    "status" "ClearCooperationStatus" NOT NULL DEFAULT 'GREEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstPublicMarketingAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "riskReason" TEXT,
    "lastAction" TEXT,
    "lastActorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClearCooperationTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonDocument" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "PersonDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverabilityMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignRef" TEXT,
    "agentId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "complaints" INTEGER NOT NULL DEFAULT 0,
    "optOuts" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverabilityMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuietHourOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT,
    "channel" "ConsentChannel" NOT NULL,
    "reason" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuietHourOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "prevOwnerId" TEXT,
    "newOwnerId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "eventTypes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrgMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT,
    "profileId" TEXT,
    "isOrgAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOrgMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionSet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionSetAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionSetId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionSetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectPermission" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "holderType" "PermissionHolderType" NOT NULL,
    "holderId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "profileId" TEXT,
    "permissionSetId" TEXT,

    CONSTRAINT "ObjectPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldPermission" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "holderType" "PermissionHolderType" NOT NULL,
    "holderId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "profileId" TEXT,
    "permissionSetId" TEXT,

    CONSTRAINT "FieldPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordShare" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "granteeType" "ShareGranteeType" NOT NULL,
    "granteeId" TEXT NOT NULL,
    "access" "ShareAccess" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "object" TEXT,
    "recordId" TEXT,
    "action" "AuditAction" NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dsl" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dsl" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "annualRevenue" DECIMAL(18,2),
    "phone" TEXT,
    "billingAddress" JSONB,
    "shippingAddress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "closeDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealDeskRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2),
    "discountPct" DECIMAL(5,2),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "DealDeskRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgCommissionPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brokerSplit" DECIMAL(5,2) NOT NULL,
    "agentSplit" DECIMAL(5,2) NOT NULL,
    "tiers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgCommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricsDaily" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "valueNum" DECIMAL(65,30),
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricsRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MetricsRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "contactId" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'New',
    "priority" TEXT DEFAULT 'Medium',
    "origin" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "transactionId" TEXT,
    "opportunityId" TEXT,
    "payeeId" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "brokerAmount" DECIMAL(18,2) NOT NULL,
    "agentAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueOn" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordType" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectLayout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recordTypeId" TEXT,
    "profile" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldLayout" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "label" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "width" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgDailyAnalytics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "granularity" "AnalyticsGranularity" NOT NULL DEFAULT 'DAILY',
    "leadsNewCount" INTEGER NOT NULL DEFAULT 0,
    "leadsContactedCount" INTEGER NOT NULL DEFAULT 0,
    "leadsQualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "leadsUnderContractCount" INTEGER NOT NULL DEFAULT 0,
    "leadsClosedCount" INTEGER NOT NULL DEFAULT 0,
    "offerIntentsSubmittedCount" INTEGER NOT NULL DEFAULT 0,
    "offerIntentsAcceptedCount" INTEGER NOT NULL DEFAULT 0,
    "offerIntentsDeclinedCount" INTEGER NOT NULL DEFAULT 0,
    "transactionsClosedCount" INTEGER NOT NULL DEFAULT 0,
    "transactionsClosedVolume" INTEGER NOT NULL DEFAULT 0,
    "averageDaysOnMarket" INTEGER NOT NULL DEFAULT 0,
    "activeLeasesCount" INTEGER NOT NULL DEFAULT 0,
    "pmIncomeEstimate" INTEGER NOT NULL DEFAULT 0,
    "savedListingsCount" INTEGER NOT NULL DEFAULT 0,
    "savedSearchesCount" INTEGER NOT NULL DEFAULT 0,
    "copilotActionsSuggestedCount" INTEGER NOT NULL DEFAULT 0,
    "copilotActionsCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgDailyAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDailyAnalytics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "granularity" "AnalyticsGranularity" NOT NULL DEFAULT 'DAILY',
    "leadsNewCount" INTEGER NOT NULL DEFAULT 0,
    "leadsContactedCount" INTEGER NOT NULL DEFAULT 0,
    "leadsQualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "leadsUnderContractCount" INTEGER NOT NULL DEFAULT 0,
    "leadsClosedCount" INTEGER NOT NULL DEFAULT 0,
    "offerIntentsSubmittedCount" INTEGER NOT NULL DEFAULT 0,
    "offerIntentsAcceptedCount" INTEGER NOT NULL DEFAULT 0,
    "transactionsClosedCount" INTEGER NOT NULL DEFAULT 0,
    "transactionsClosedVolume" INTEGER NOT NULL DEFAULT 0,
    "activeLeasesCount" INTEGER NOT NULL DEFAULT 0,
    "copilotActionsSuggestedCount" INTEGER NOT NULL DEFAULT 0,
    "copilotActionsCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDailyAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatSession_organizationId_userId_idx" ON "ChatSession"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "AiMemory_tenantId_personaId_createdAt_idx" ON "AiMemory"("tenantId", "personaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiEmployeeTemplate_key_key" ON "AiEmployeeTemplate"("key");

-- CreateIndex
CREATE INDEX "AiEmployeeInstance_tenantId_status_templateId_idx" ON "AiEmployeeInstance"("tenantId", "status", "templateId");

-- CreateIndex
CREATE INDEX "AiEmployeeInstance_tenantId_userId_idx" ON "AiEmployeeInstance"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "AiEmployeeSession_employeeInstanceId_tenantId_userId_idx" ON "AiEmployeeSession"("employeeInstanceId", "tenantId", "userId");

-- CreateIndex
CREATE INDEX "AiEmployeeSession_tenantId_channel_contextType_contextId_idx" ON "AiEmployeeSession"("tenantId", "channel", "contextType", "contextId");

-- CreateIndex
CREATE INDEX "AiProposedAction_tenantId_status_requiresApproval_idx" ON "AiProposedAction"("tenantId", "status", "requiresApproval");

-- CreateIndex
CREATE INDEX "AiProposedAction_employeeInstanceId_status_idx" ON "AiProposedAction"("employeeInstanceId", "status");

-- CreateIndex
CREATE INDEX "AiExecutionLog_tenantId_success_idx" ON "AiExecutionLog"("tenantId", "success");

-- CreateIndex
CREATE INDEX "AiExecutionLog_employeeInstanceId_proposedActionId_idx" ON "AiExecutionLog"("employeeInstanceId", "proposedActionId");

-- CreateIndex
CREATE INDEX "AiExecutionLog_sessionId_idx" ON "AiExecutionLog"("sessionId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_isRead_createdAt_idx" ON "Notification"("organizationId", "userId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_organizationId_userId_key" ON "NotificationPreference"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "OrgAuditLog_organizationId_createdAt_idx" ON "OrgAuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgAuditLog_organizationId_userId_createdAt_idx" ON "OrgAuditLog"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailSequence_tenantId_name_idx" ON "EmailSequence"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EmailStep_tenantId_sequenceId_idx" ON "EmailStep"("tenantId", "sequenceId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailStep_sequenceId_stepIndex_key" ON "EmailStep"("sequenceId", "stepIndex");

-- CreateIndex
CREATE INDEX "LeadSequenceEnrollment_tenantId_leadId_idx" ON "LeadSequenceEnrollment"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "LeadSequenceEnrollment_tenantId_sequenceId_idx" ON "LeadSequenceEnrollment"("tenantId", "sequenceId");

-- CreateIndex
CREATE INDEX "LeadSequenceEnrollment_tenantId_active_idx" ON "LeadSequenceEnrollment"("tenantId", "active");

-- CreateIndex
CREATE INDEX "LeadScoreV2_tenantId_idx" ON "LeadScoreV2"("tenantId");

-- CreateIndex
CREATE INDEX "vectorchunk_tenant_entity_idx" ON "VectorChunk"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "vectorchunk_tenant_entity_chunk_uq" ON "VectorChunk"("tenant_id", "entity_type", "entity_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgListing_mlsNumber_key" ON "OrgListing"("mlsNumber");

-- CreateIndex
CREATE INDEX "OrgListing_organizationId_idx" ON "OrgListing"("organizationId");

-- CreateIndex
CREATE INDEX "OrgListingDocument_listingId_idx" ON "OrgListingDocument"("listingId");

-- CreateIndex
CREATE INDEX "OrgTransaction_organizationId_idx" ON "OrgTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "OrgTransactionDocument_transactionId_idx" ON "OrgTransactionDocument"("transactionId");

-- CreateIndex
CREATE INDEX "ContractTemplate_organizationId_isActive_idx" ON "ContractTemplate"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "ContractTemplate_organizationId_propertyType_side_jurisdict_idx" ON "ContractTemplate"("organizationId", "propertyType", "side", "jurisdiction");

-- CreateIndex
CREATE INDEX "ContractFieldMapping_templateId_idx" ON "ContractFieldMapping"("templateId");

-- CreateIndex
CREATE INDEX "ContractInstance_organizationId_status_idx" ON "ContractInstance"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ContractInstance_organizationId_orgListingId_idx" ON "ContractInstance"("organizationId", "orgListingId");

-- CreateIndex
CREATE INDEX "ContractInstance_organizationId_orgTransactionId_idx" ON "ContractInstance"("organizationId", "orgTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureEnvelope_contractInstanceId_key" ON "SignatureEnvelope"("contractInstanceId");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_provider_providerEnvelopeId_idx" ON "SignatureEnvelope"("provider", "providerEnvelopeId");

-- CreateIndex
CREATE INDEX "OrgConversation_organizationId_type_idx" ON "OrgConversation"("organizationId", "type");

-- CreateIndex
CREATE INDEX "OrgConversationParticipant_userId_idx" ON "OrgConversationParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgConversationParticipant_conversationId_userId_key" ON "OrgConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "OrgMessage_organizationId_conversationId_createdAt_idx" ON "OrgMessage"("organizationId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgMessageAttachment_messageId_idx" ON "OrgMessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "AgentProfile_organizationId_idx" ON "AgentProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_organizationId_userId_key" ON "AgentProfile"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "AgentMembership_agentProfileId_type_idx" ON "AgentMembership"("agentProfileId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTrainingProgress_agentProfileId_moduleId_key" ON "AgentTrainingProgress"("agentProfileId", "moduleId");

-- CreateIndex
CREATE INDEX "OrgWorkflowTemplate_organizationId_type_idx" ON "OrgWorkflowTemplate"("organizationId", "type");

-- CreateIndex
CREATE INDEX "OrgWorkflowTemplateTask_templateId_idx" ON "OrgWorkflowTemplateTask"("templateId");

-- CreateIndex
CREATE INDEX "AgentWorkflowTask_organizationId_agentProfileId_type_idx" ON "AgentWorkflowTask"("organizationId", "agentProfileId", "type");

-- CreateIndex
CREATE INDEX "OfferIntent_organizationId_listingId_idx" ON "OfferIntent"("organizationId", "listingId");

-- CreateIndex
CREATE INDEX "OfferIntent_organizationId_consumerId_idx" ON "OfferIntent"("organizationId", "consumerId");

-- CreateIndex
CREATE INDEX "RentalProperty_organizationId_status_idx" ON "RentalProperty"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RentalUnit_propertyId_status_idx" ON "RentalUnit"("propertyId", "status");

-- CreateIndex
CREATE INDEX "RentalLease_organizationId_unitId_idx" ON "RentalLease"("organizationId", "unitId");

-- CreateIndex
CREATE INDEX "RentalTaxSchedule_leaseId_status_dueDate_idx" ON "RentalTaxSchedule"("leaseId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "MlsFeedConfig_organizationId_key" ON "MlsFeedConfig"("organizationId");

-- CreateIndex
CREATE INDEX "MlsSyncRun_organizationId_startedAt_idx" ON "MlsSyncRun"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "ListingSearchIndex_organizationId_isActive_idx" ON "ListingSearchIndex"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "ListingSearchIndex_organizationId_city_idx" ON "ListingSearchIndex"("organizationId", "city");

-- CreateIndex
CREATE INDEX "ListingSearchIndex_organizationId_state_idx" ON "ListingSearchIndex"("organizationId", "state");

-- CreateIndex
CREATE INDEX "ListingSearchIndex_organizationId_postalCode_idx" ON "ListingSearchIndex"("organizationId", "postalCode");

-- CreateIndex
CREATE UNIQUE INDEX "ListingSearchIndex_organizationId_mlsNumber_key" ON "ListingSearchIndex"("organizationId", "mlsNumber");

-- CreateIndex
CREATE INDEX "SavedListing_organizationId_consumerId_idx" ON "SavedListing"("organizationId", "consumerId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedListing_consumerId_searchIndexId_key" ON "SavedListing"("consumerId", "searchIndexId");

-- CreateIndex
CREATE INDEX "SavedSearch_organizationId_consumerId_idx" ON "SavedSearch"("organizationId", "consumerId");

-- CreateIndex
CREATE INDEX "SavedSearchAlertEvent_savedSearchId_sentAt_idx" ON "SavedSearchAlertEvent"("savedSearchId", "sentAt");

-- CreateIndex
CREATE INDEX "AiCopilotInsight_organizationId_agentProfileId_type_created_idx" ON "AiCopilotInsight"("organizationId", "agentProfileId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AiCopilotActionRecommendation_organizationId_agentProfileId_idx" ON "AiCopilotActionRecommendation"("organizationId", "agentProfileId", "status");

-- CreateIndex
CREATE INDEX "AiCopilotActionRecommendation_leadId_idx" ON "AiCopilotActionRecommendation"("leadId");

-- CreateIndex
CREATE INDEX "AiCopilotActionRecommendation_orgListingId_idx" ON "AiCopilotActionRecommendation"("orgListingId");

-- CreateIndex
CREATE INDEX "AiCopilotActionRecommendation_orgTransactionId_idx" ON "AiCopilotActionRecommendation"("orgTransactionId");

-- CreateIndex
CREATE INDEX "AiCopilotActionRecommendation_leaseId_idx" ON "AiCopilotActionRecommendation"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingIntegrationConfig_organizationId_key" ON "AccountingIntegrationConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionAccountingRecord_transactionId_key" ON "TransactionAccountingRecord"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionAccountingRecord_organizationId_provider_syncSta_idx" ON "TransactionAccountingRecord"("organizationId", "provider", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RentalLeaseAccountingRecord_leaseId_key" ON "RentalLeaseAccountingRecord"("leaseId");

-- CreateIndex
CREATE INDEX "RentalLeaseAccountingRecord_organizationId_provider_syncSta_idx" ON "RentalLeaseAccountingRecord"("organizationId", "provider", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_orgId_key" ON "QuickBooksConnection"("orgId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_idx" ON "Lead"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Lead_organizationId_agentProfileId_idx" ON "Lead"("organizationId", "agentProfileId");

-- CreateIndex
CREATE INDEX "LeadScoreHistory_organizationId_leadId_createdAt_idx" ON "LeadScoreHistory"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "DripCampaign_organizationId_enabled_idx" ON "DripCampaign"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "DripStep_campaignId_idx" ON "DripStep"("campaignId");

-- CreateIndex
CREATE INDEX "RevenueForecast_organizationId_createdAt_idx" ON "RevenueForecast"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgFolder_orgId_parentId_idx" ON "OrgFolder"("orgId", "parentId");

-- CreateIndex
CREATE INDEX "OrgFile_orgId_folderId_idx" ON "OrgFile"("orgId", "folderId");

-- CreateIndex
CREATE INDEX "OrgFile_orgId_category_idx" ON "OrgFile"("orgId", "category");

-- CreateIndex
CREATE INDEX "OrgFile_listingId_idx" ON "OrgFile"("listingId");

-- CreateIndex
CREATE INDEX "OrgFile_transactionId_idx" ON "OrgFile"("transactionId");

-- CreateIndex
CREATE INDEX "OrgFile_leaseId_idx" ON "OrgFile"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgFileVersion_orgFileId_versionNumber_key" ON "OrgFileVersion"("orgFileId", "versionNumber");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_organizationId_source_idx" ON "KnowledgeDocument"("organizationId", "source");

-- CreateIndex
CREATE INDEX "OrgFileComment_orgFileId_idx" ON "OrgFileComment"("orgFileId");

-- CreateIndex
CREATE INDEX "AgentPerformanceSnapshot_organizationId_agentProfileId_peri_idx" ON "AgentPerformanceSnapshot"("organizationId", "agentProfileId", "periodStart");

-- CreateIndex
CREATE INDEX "SearchVector_organizationId_entityType_idx" ON "SearchVector"("organizationId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "SearchVector_organizationId_entityType_entityId_key" ON "SearchVector"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "LivePresence_organizationId_location_idx" ON "LivePresence"("organizationId", "location");

-- CreateIndex
CREATE UNIQUE INDEX "LivePresence_organizationId_userId_key" ON "LivePresence"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "AiInsight_organizationId_type_idx" ON "AiInsight"("organizationId", "type");

-- CreateIndex
CREATE INDEX "AiInsight_organizationId_targetId_idx" ON "AiInsight"("organizationId", "targetId");

-- CreateIndex
CREATE INDEX "Playbook_organizationId_enabled_idx" ON "Playbook"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "PlaybookRun_organizationId_playbookId_startedAt_idx" ON "PlaybookRun"("organizationId", "playbookId", "startedAt");

-- CreateIndex
CREATE INDEX "PlaybookRun_organizationId_listingId_idx" ON "PlaybookRun"("organizationId", "listingId");

-- CreateIndex
CREATE INDEX "PlaybookRun_organizationId_leadId_idx" ON "PlaybookRun"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "PlaybookRun_organizationId_transactionId_idx" ON "PlaybookRun"("organizationId", "transactionId");

-- CreateIndex
CREATE INDEX "PlaybookRun_organizationId_leaseId_idx" ON "PlaybookRun"("organizationId", "leaseId");

-- CreateIndex
CREATE INDEX "OrgEvent_organizationId_createdAt_idx" ON "OrgEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgEvent_actorId_createdAt_idx" ON "OrgEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgEvent_type_organizationId_idx" ON "OrgEvent"("type", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentInvite_token_key" ON "AgentInvite"("token");

-- CreateIndex
CREATE INDEX "AgentInvite_organizationId_idx" ON "AgentInvite"("organizationId");

-- CreateIndex
CREATE INDEX "AgentInvite_email_idx" ON "AgentInvite"("email");

-- CreateIndex
CREATE INDEX "Team_orgId_idx" ON "Team"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");

-- CreateIndex
CREATE INDEX "team_members_tenant_id_idx" ON "team_members"("tenant_id");

-- CreateIndex
CREATE INDEX "team_members_org_id_idx" ON "team_members"("org_id");

-- CreateIndex
CREATE INDEX "DelegatedAccess_organizationId_agentId_idx" ON "DelegatedAccess"("organizationId", "agentId");

-- CreateIndex
CREATE INDEX "DelegatedAccess_organizationId_assistantId_idx" ON "DelegatedAccess"("organizationId", "assistantId");

-- CreateIndex
CREATE INDEX "Person_tenantId_deletedAt_idx" ON "Person"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Person_tenantId_pipelineId_idx" ON "Person"("tenantId", "pipelineId");

-- CreateIndex
CREATE INDEX "Person_tenantId_stageId_idx" ON "Person"("tenantId", "stageId");

-- CreateIndex
CREATE INDEX "Person_tenantId_companyId_idx" ON "Person"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Person_tenantId_householdId_idx" ON "Person"("tenantId", "householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_tenantId_primaryEmail_key" ON "Person"("tenantId", "primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Person_tenantId_primaryPhone_key" ON "Person"("tenantId", "primaryPhone");

-- CreateIndex
CREATE INDEX "Company_tenantId_name_idx" ON "Company"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Company_tenantId_ownerId_idx" ON "Company"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Company_tenantId_primaryContactId_idx" ON "Company"("tenantId", "primaryContactId");

-- CreateIndex
CREATE INDEX "Household_tenantId_ownerId_idx" ON "Household"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Pipeline_tenantId_idx" ON "Pipeline"("tenantId");

-- CreateIndex
CREATE INDEX "Pipeline_tenantId_isDefault_idx" ON "Pipeline"("tenantId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_tenantId_name_key" ON "Pipeline"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_tenantId_familyId_version_key" ON "Pipeline"("tenantId", "familyId", "version");

-- CreateIndex
CREATE INDEX "Stage_tenantId_idx" ON "Stage"("tenantId");

-- CreateIndex
CREATE INDEX "Stage_tenantId_pipelineId_idx" ON "Stage"("tenantId", "pipelineId");

-- CreateIndex
CREATE INDEX "Stage_tenantId_pipelineId_order_idx" ON "Stage"("tenantId", "pipelineId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_tenantId_pipelineId_name_key" ON "Stage"("tenantId", "pipelineId", "name");

-- CreateIndex
CREATE INDEX "FieldSet_tenantId_idx" ON "FieldSet"("tenantId");

-- CreateIndex
CREATE INDEX "FieldSet_tenantId_pipelineId_idx" ON "FieldSet"("tenantId", "pipelineId");

-- CreateIndex
CREATE INDEX "PipelineAutomation_tenantId_idx" ON "PipelineAutomation"("tenantId");

-- CreateIndex
CREATE INDEX "PipelineAutomation_tenantId_pipelineId_idx" ON "PipelineAutomation"("tenantId", "pipelineId");

-- CreateIndex
CREATE INDEX "PipelineAutomation_tenantId_isEnabled_idx" ON "PipelineAutomation"("tenantId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "LeadFit_personId_key" ON "LeadFit"("personId");

-- CreateIndex
CREATE INDEX "LeadFit_tenantId_idx" ON "LeadFit"("tenantId");

-- CreateIndex
CREATE INDEX "Event_tenantId_idx" ON "Event"("tenantId");

-- CreateIndex
CREATE INDEX "Event_tenantId_personId_idx" ON "Event"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "Event_tenantId_name_timestamp_idx" ON "Event"("tenantId", "name", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "LeadActivityRollup_personId_key" ON "LeadActivityRollup"("personId");

-- CreateIndex
CREATE INDEX "LeadActivityRollup_tenantId_idx" ON "LeadActivityRollup"("tenantId");

-- CreateIndex
CREATE INDEX "LeadNote_tenantId_personId_idx" ON "LeadNote"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "LeadTouchpoint_tenantId_personId_occurredAt_idx" ON "LeadTouchpoint"("tenantId", "personId", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadTask_tenantId_personId_idx" ON "LeadTask"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "LeadHistory_tenantId_personId_occurredAt_idx" ON "LeadHistory"("tenantId", "personId", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadHistory_tenantId_actorId_idx" ON "LeadHistory"("tenantId", "actorId");

-- CreateIndex
CREATE INDEX "ClientAnalyticsEvent_tenantId_occurredAt_idx" ON "ClientAnalyticsEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "ClientAnalyticsEvent_tenantId_name_idx" ON "ClientAnalyticsEvent"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ConsentEvent_tenantId_personId_channel_occurredAt_idx" ON "ConsentEvent"("tenantId", "personId", "channel", "occurredAt");

-- CreateIndex
CREATE INDEX "ConsentEvent_tenantId_actorId_idx" ON "ConsentEvent"("tenantId", "actorId");

-- CreateIndex
CREATE INDEX "Touchpoint_tenantId_personId_createdAt_idx" ON "Touchpoint"("tenantId", "personId", "createdAt");

-- CreateIndex
CREATE INDEX "Touchpoint_tenantId_conversationId_idx" ON "Touchpoint"("tenantId", "conversationId");

-- CreateIndex
CREATE INDEX "Touchpoint_tenantId_status_idx" ON "Touchpoint"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Touchpoint_tenantId_actorId_idx" ON "Touchpoint"("tenantId", "actorId");

-- CreateIndex
CREATE INDEX "SavedView_tenantId_scope_idx" ON "SavedView"("tenantId", "scope");

-- CreateIndex
CREATE INDEX "SavedView_tenantId_teamId_idx" ON "SavedView"("tenantId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_userId_name_key" ON "SavedView"("userId", "name");

-- CreateIndex
CREATE INDEX "ViewPreset_tenantId_idx" ON "ViewPreset"("tenantId");

-- CreateIndex
CREATE INDEX "ViewPreset_tenantId_scope_idx" ON "ViewPreset"("tenantId", "scope");

-- CreateIndex
CREATE INDEX "ViewPreset_tenantId_isDefault_idx" ON "ViewPreset"("tenantId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ViewPresetShareToken_token_key" ON "ViewPresetShareToken"("token");

-- CreateIndex
CREATE INDEX "ViewPresetShareToken_viewPresetId_idx" ON "ViewPresetShareToken"("viewPresetId");

-- CreateIndex
CREATE INDEX "ConsumerPortalConfig_tenantId_viewPresetId_idx" ON "ConsumerPortalConfig"("tenantId", "viewPresetId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumerPortalConfig_tenantId_key" ON "ConsumerPortalConfig"("tenantId");

-- CreateIndex
CREATE INDEX "Sequence_tenantId_active_idx" ON "Sequence"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_tenantId_name_key" ON "Sequence"("tenantId", "name");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_tenantId_sequenceId_idx" ON "SequenceEnrollment"("tenantId", "sequenceId");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_tenantId_personId_idx" ON "SequenceEnrollment"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_tenantId_status_idx" ON "SequenceEnrollment"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEnrollment_sequenceId_personId_key" ON "SequenceEnrollment"("sequenceId", "personId");

-- CreateIndex
CREATE INDEX "SequenceStepLog_tenantId_sequenceId_idx" ON "SequenceStepLog"("tenantId", "sequenceId");

-- CreateIndex
CREATE INDEX "SequenceStepLog_tenantId_enrollmentId_idx" ON "SequenceStepLog"("tenantId", "enrollmentId");

-- CreateIndex
CREATE INDEX "SequenceStepLog_tenantId_status_idx" ON "SequenceStepLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MessageTemplate_tenantId_organizationId_idx" ON "MessageTemplate"("tenantId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_tenantId_name_key" ON "MessageTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_isActive_idx" ON "Campaign"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_tenantId_name_key" ON "Campaign"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CampaignStep_campaignId_templateId_idx" ON "CampaignStep"("campaignId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignStep_campaignId_order_key" ON "CampaignStep"("campaignId", "order");

-- CreateIndex
CREATE INDEX "CampaignEnrollment_tenantId_status_idx" ON "CampaignEnrollment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CampaignEnrollment_tenantId_nextRunAt_idx" ON "CampaignEnrollment"("tenantId", "nextRunAt");

-- CreateIndex
CREATE INDEX "CampaignEnrollment_tenantId_campaignId_idx" ON "CampaignEnrollment"("tenantId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEnrollment_campaignId_leadId_key" ON "CampaignEnrollment"("campaignId", "leadId");

-- CreateIndex
CREATE INDEX "OutreachEvent_enrollmentId_idx" ON "OutreachEvent"("enrollmentId");

-- CreateIndex
CREATE INDEX "OutreachEvent_tenantId_organizationId_idx" ON "OutreachEvent"("tenantId", "organizationId");

-- CreateIndex
CREATE INDEX "OutreachEvent_tenantId_status_idx" ON "OutreachEvent"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomField_tenantId_entity_idx" ON "CustomField"("tenantId", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_tenantId_entity_key_key" ON "CustomField"("tenantId", "entity", "key");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenantId_fieldId_idx" ON "CustomFieldValue"("tenantId", "fieldId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenantId_personId_idx" ON "CustomFieldValue"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenantId_dealId_idx" ON "CustomFieldValue"("tenantId", "dealId");

-- CreateIndex
CREATE INDEX "CustomFieldLayout_tenantId_entity_idx" ON "CustomFieldLayout"("tenantId", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldLayout_tenantId_entity_name_key" ON "CustomFieldLayout"("tenantId", "entity", "name");

-- CreateIndex
CREATE INDEX "ContactMergeProposal_tenantId_status_idx" ON "ContactMergeProposal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Consent_personId_channel_scope_idx" ON "Consent"("personId", "channel", "scope");

-- CreateIndex
CREATE INDEX "Listing_opportunityId_idx" ON "Listing"("opportunityId");

-- CreateIndex
CREATE INDEX "CalendarEvent_tenantId_startAt_idx" ON "CalendarEvent"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_assignedAgentId_idx" ON "CalendarEvent"("assignedAgentId");

-- CreateIndex
CREATE INDEX "CalendarEvent_personId_idx" ON "CalendarEvent"("personId");

-- CreateIndex
CREATE INDEX "Agreement_personId_type_status_idx" ON "Agreement"("personId", "type", "status");

-- CreateIndex
CREATE INDEX "Deal_opportunityId_idx" ON "Deal"("opportunityId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_listingId_idx" ON "Deal"("tenantId", "listingId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_stage_idx" ON "Deal"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "Deal_tenantId_companyId_idx" ON "Deal"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Offer_tenantId_listingId_status_idx" ON "Offer"("tenantId", "listingId", "status");

-- CreateIndex
CREATE INDEX "TourAgreementLink_agreementId_idx" ON "TourAgreementLink"("agreementId");

-- CreateIndex
CREATE INDEX "DisclaimerPolicy_tenantId_mlsProfileId_idx" ON "DisclaimerPolicy"("tenantId", "mlsProfileId");

-- CreateIndex
CREATE INDEX "OverrideLog_tenantId_context_idx" ON "OverrideLog"("tenantId", "context");

-- CreateIndex
CREATE INDEX "MarketingEvent_tenantId_occurredAt_idx" ON "MarketingEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_listingId_idx" ON "MarketingEvent"("listingId");

-- CreateIndex
CREATE INDEX "MarketingEvent_mlsProfileId_idx" ON "MarketingEvent"("mlsProfileId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_status_idx" ON "MarketingCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_createdAt_idx" ON "MarketingCampaign"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceStatusDaily_tenantId_date_teamId_agentId_key" ON "ComplianceStatusDaily"("tenantId", "date", "teamId", "agentId");

-- CreateIndex
CREATE INDEX "CommissionPlan_tenantId_isArchived_idx" ON "CommissionPlan"("tenantId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPlan_tenantId_name_version_key" ON "CommissionPlan"("tenantId", "name", "version");

-- CreateIndex
CREATE INDEX "PlanAssignment_tenantId_assigneeType_assigneeId_effectiveFr_idx" ON "PlanAssignment"("tenantId", "assigneeType", "assigneeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PlanAssignment_tenantId_assigneeType_assigneeId_planId_effe_key" ON "PlanAssignment"("tenantId", "assigneeType", "assigneeId", "planId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CapLedger_tenantId_userId_planId_periodStart_periodEnd_idx" ON "CapLedger"("tenantId", "userId", "planId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CapLedger_tenantId_userId_planId_periodStart_key" ON "CapLedger"("tenantId", "userId", "planId", "periodStart");

-- CreateIndex
CREATE INDEX "PlanSnapshot_tenantId_planId_version_idx" ON "PlanSnapshot"("tenantId", "planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSnapshot_planId_version_key" ON "PlanSnapshot"("planId", "version");

-- CreateIndex
CREATE INDEX "RoutingRule_tenantId_priority_idx" ON "RoutingRule"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "LeadRouteEvent_tenantId_createdAt_idx" ON "LeadRouteEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadRouteEvent_tenantId_leadId_idx" ON "LeadRouteEvent"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "Queue_tenantId_routingMode_isActive_idx" ON "Queue"("tenantId", "routingMode", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_tenantId_name_key" ON "Queue"("tenantId", "name");

-- CreateIndex
CREATE INDEX "QueueAssignment_tenantId_queueId_idx" ON "QueueAssignment"("tenantId", "queueId");

-- CreateIndex
CREATE INDEX "QueueAssignment_tenantId_personId_idx" ON "QueueAssignment"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "QueueAssignment_tenantId_assigneeId_idx" ON "QueueAssignment"("tenantId", "assigneeId");

-- CreateIndex
CREATE INDEX "QueueAssignment_tenantId_expiresAt_idx" ON "QueueAssignment"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "LeadSlaTimer_tenantId_leadId_idx" ON "LeadSlaTimer"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "LeadSlaTimer_tenantId_status_idx" ON "LeadSlaTimer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_type_idx" ON "Conversation"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_personId_idx" ON "Conversation"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_updatedAt_idx" ON "Conversation"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_role_idx" ON "ConversationParticipant"("conversationId", "role");

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_userId_idx" ON "ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_personId_idx" ON "ConversationParticipant"("conversationId", "personId");

-- CreateIndex
CREATE INDEX "MessageReceipt_participantId_status_idx" ON "MessageReceipt"("participantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReceipt_messageId_participantId_status_key" ON "MessageReceipt"("messageId", "participantId", "status");

-- CreateIndex
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");

-- CreateIndex
CREATE INDEX "MessageAttachment_checksum_idx" ON "MessageAttachment"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "JourneySimulation_tenantId_leadId_journeyId_key" ON "JourneySimulation"("tenantId", "leadId", "journeyId");

-- CreateIndex
CREATE INDEX "CommunicationBlock_personId_channel_idx" ON "CommunicationBlock"("personId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "ClearCooperationTimer_listingId_key" ON "ClearCooperationTimer"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverabilityMetric_tenantId_agentId_channel_recordedAt_key" ON "DeliverabilityMetric"("tenantId", "agentId", "channel", "recordedAt");

-- CreateIndex
CREATE INDEX "RoutingLog_tenantId_personId_idx" ON "RoutingLog"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "UserOrgMembership_orgId_idx" ON "UserOrgMembership"("orgId");

-- CreateIndex
CREATE INDEX "UserOrgMembership_profileId_idx" ON "UserOrgMembership"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOrgMembership_userId_orgId_key" ON "UserOrgMembership"("userId", "orgId");

-- CreateIndex
CREATE INDEX "Role_orgId_idx" ON "Role"("orgId");

-- CreateIndex
CREATE INDEX "Profile_orgId_idx" ON "Profile"("orgId");

-- CreateIndex
CREATE INDEX "PermissionSet_orgId_idx" ON "PermissionSet"("orgId");

-- CreateIndex
CREATE INDEX "PermissionSetAssignment_permissionSetId_idx" ON "PermissionSetAssignment"("permissionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionSetAssignment_userId_permissionSetId_key" ON "PermissionSetAssignment"("userId", "permissionSetId");

-- CreateIndex
CREATE INDEX "ObjectPermission_orgId_holderType_holderId_object_idx" ON "ObjectPermission"("orgId", "holderType", "holderId", "object");

-- CreateIndex
CREATE INDEX "ObjectPermission_profileId_idx" ON "ObjectPermission"("profileId");

-- CreateIndex
CREATE INDEX "ObjectPermission_permissionSetId_idx" ON "ObjectPermission"("permissionSetId");

-- CreateIndex
CREATE INDEX "FieldPermission_orgId_holderType_holderId_object_field_idx" ON "FieldPermission"("orgId", "holderType", "holderId", "object", "field");

-- CreateIndex
CREATE INDEX "FieldPermission_profileId_idx" ON "FieldPermission"("profileId");

-- CreateIndex
CREATE INDEX "FieldPermission_permissionSetId_idx" ON "FieldPermission"("permissionSetId");

-- CreateIndex
CREATE INDEX "RecordShare_orgId_object_recordId_idx" ON "RecordShare"("orgId", "object", "recordId");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_object_recordId_idx" ON "AuditEvent"("orgId", "object", "recordId");

-- CreateIndex
CREATE INDEX "ValidationRule_orgId_object_active_idx" ON "ValidationRule"("orgId", "object", "active");

-- CreateIndex
CREATE INDEX "AssignmentRule_orgId_object_active_idx" ON "AssignmentRule"("orgId", "object", "active");

-- CreateIndex
CREATE INDEX "Account_orgId_name_idx" ON "Account"("orgId", "name");

-- CreateIndex
CREATE INDEX "Opportunity_orgId_stage_closeDate_idx" ON "Opportunity"("orgId", "stage", "closeDate");

-- CreateIndex
CREATE INDEX "FileObject_orgId_storageKey_idx" ON "FileObject"("orgId", "storageKey");

-- CreateIndex
CREATE INDEX "FileLink_orgId_object_recordId_idx" ON "FileLink"("orgId", "object", "recordId");

-- CreateIndex
CREATE INDEX "DealDeskRequest_orgId_status_opportunityId_idx" ON "DealDeskRequest"("orgId", "status", "opportunityId");

-- CreateIndex
CREATE INDEX "OrgCommissionPlan_orgId_name_idx" ON "OrgCommissionPlan"("orgId", "name");

-- CreateIndex
CREATE INDEX "MetricsDaily_orgId_key_date_idx" ON "MetricsDaily"("orgId", "key", "date");

-- CreateIndex
CREATE INDEX "MetricsRun_orgId_key_createdAt_idx" ON "MetricsRun"("orgId", "key", "createdAt");

-- CreateIndex
CREATE INDEX "Case_orgId_status_priority_idx" ON "Case"("orgId", "status", "priority");

-- CreateIndex
CREATE INDEX "Payout_orgId_status_idx" ON "Payout"("orgId", "status");

-- CreateIndex
CREATE INDEX "RecordType_orgId_object_idx" ON "RecordType"("orgId", "object");

-- CreateIndex
CREATE UNIQUE INDEX "RecordType_orgId_object_key_key" ON "RecordType"("orgId", "object", "key");

-- CreateIndex
CREATE INDEX "ObjectLayout_orgId_object_kind_idx" ON "ObjectLayout"("orgId", "object", "kind");

-- CreateIndex
CREATE INDEX "ObjectLayout_orgId_object_kind_profile_idx" ON "ObjectLayout"("orgId", "object", "kind", "profile");

-- CreateIndex
CREATE INDEX "ObjectLayout_orgId_object_kind_recordTypeId_profile_idx" ON "ObjectLayout"("orgId", "object", "kind", "recordTypeId", "profile");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectLayout_orgId_object_kind_recordTypeId_profile_key" ON "ObjectLayout"("orgId", "object", "kind", "recordTypeId", "profile");

-- CreateIndex
CREATE INDEX "FieldLayout_layoutId_order_idx" ON "FieldLayout"("layoutId", "order");

-- CreateIndex
CREATE INDEX "OrgDailyAnalytics_organizationId_date_idx" ON "OrgDailyAnalytics"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OrgDailyAnalytics_organizationId_date_granularity_key" ON "OrgDailyAnalytics"("organizationId", "date", "granularity");

-- CreateIndex
CREATE INDEX "AgentDailyAnalytics_organizationId_agentProfileId_date_idx" ON "AgentDailyAnalytics"("organizationId", "agentProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDailyAnalytics_organizationId_agentProfileId_date_gran_key" ON "AgentDailyAnalytics"("organizationId", "agentProfileId", "date", "granularity");

-- CreateIndex
CREATE UNIQUE INDEX "BatchEvent_externalId_key" ON "BatchEvent"("externalId");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEmployeeInstance" ADD CONSTRAINT "AiEmployeeInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AiEmployeeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEmployeeInstance" ADD CONSTRAINT "AiEmployeeInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEmployeeInstance" ADD CONSTRAINT "AiEmployeeInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEmployeeSession" ADD CONSTRAINT "AiEmployeeSession_employeeInstanceId_fkey" FOREIGN KEY ("employeeInstanceId") REFERENCES "AiEmployeeInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEmployeeSession" ADD CONSTRAINT "AiEmployeeSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEmployeeSession" ADD CONSTRAINT "AiEmployeeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_employeeInstanceId_fkey" FOREIGN KEY ("employeeInstanceId") REFERENCES "AiEmployeeInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiEmployeeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExecutionLog" ADD CONSTRAINT "AiExecutionLog_employeeInstanceId_fkey" FOREIGN KEY ("employeeInstanceId") REFERENCES "AiEmployeeInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExecutionLog" ADD CONSTRAINT "AiExecutionLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiEmployeeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExecutionLog" ADD CONSTRAINT "AiExecutionLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExecutionLog" ADD CONSTRAINT "AiExecutionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExecutionLog" ADD CONSTRAINT "AiExecutionLog_proposedActionId_fkey" FOREIGN KEY ("proposedActionId") REFERENCES "AiProposedAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAuditLog" ADD CONSTRAINT "OrgAuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAuditLog" ADD CONSTRAINT "OrgAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSequence" ADD CONSTRAINT "EmailSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailStep" ADD CONSTRAINT "EmailStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailStep" ADD CONSTRAINT "EmailStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSequenceEnrollment" ADD CONSTRAINT "LeadSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "EmailSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSequenceEnrollment" ADD CONSTRAINT "LeadSequenceEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSequenceEnrollment" ADD CONSTRAINT "LeadSequenceEnrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScoreV2" ADD CONSTRAINT "LeadScoreV2_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScoreV2" ADD CONSTRAINT "LeadScoreV2_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VectorChunk" ADD CONSTRAINT "VectorChunk_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgListing" ADD CONSTRAINT "OrgListing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgListing" ADD CONSTRAINT "OrgListing_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgListing" ADD CONSTRAINT "OrgListing_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgListing" ADD CONSTRAINT "OrgListing_brokerApprovedByUserId_fkey" FOREIGN KEY ("brokerApprovedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgListing" ADD CONSTRAINT "OrgListing_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgListingDocument" ADD CONSTRAINT "OrgListingDocument_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgListingDocument" ADD CONSTRAINT "OrgListingDocument_orgFileId_fkey" FOREIGN KEY ("orgFileId") REFERENCES "OrgFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTransaction" ADD CONSTRAINT "OrgTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTransaction" ADD CONSTRAINT "OrgTransaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTransaction" ADD CONSTRAINT "OrgTransaction_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTransaction" ADD CONSTRAINT "OrgTransaction_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTransaction" ADD CONSTRAINT "OrgTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTransactionDocument" ADD CONSTRAINT "OrgTransactionDocument_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "OrgTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTransactionDocument" ADD CONSTRAINT "OrgTransactionDocument_orgFileId_fkey" FOREIGN KEY ("orgFileId") REFERENCES "OrgFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractFieldMapping" ADD CONSTRAINT "ContractFieldMapping_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractInstance" ADD CONSTRAINT "ContractInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractInstance" ADD CONSTRAINT "ContractInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractInstance" ADD CONSTRAINT "ContractInstance_orgListingId_fkey" FOREIGN KEY ("orgListingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractInstance" ADD CONSTRAINT "ContractInstance_orgTransactionId_fkey" FOREIGN KEY ("orgTransactionId") REFERENCES "OrgTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractInstance" ADD CONSTRAINT "ContractInstance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEnvelope" ADD CONSTRAINT "SignatureEnvelope_contractInstanceId_fkey" FOREIGN KEY ("contractInstanceId") REFERENCES "ContractInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgConversation" ADD CONSTRAINT "OrgConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgConversation" ADD CONSTRAINT "OrgConversation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgConversationParticipant" ADD CONSTRAINT "OrgConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "OrgConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgConversationParticipant" ADD CONSTRAINT "OrgConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMessage" ADD CONSTRAINT "OrgMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMessage" ADD CONSTRAINT "OrgMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "OrgConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMessage" ADD CONSTRAINT "OrgMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMessageAttachment" ADD CONSTRAINT "OrgMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OrgMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMessageAttachment" ADD CONSTRAINT "OrgMessageAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMembership" ADD CONSTRAINT "AgentMembership_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCERecord" ADD CONSTRAINT "AgentCERecord_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTrainingModule" ADD CONSTRAINT "AgentTrainingModule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTrainingModule" ADD CONSTRAINT "AgentTrainingModule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTrainingModule" ADD CONSTRAINT "AgentTrainingModule_orgFileId_fkey" FOREIGN KEY ("orgFileId") REFERENCES "OrgFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTrainingProgress" ADD CONSTRAINT "AgentTrainingProgress_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTrainingProgress" ADD CONSTRAINT "AgentTrainingProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AgentTrainingModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgWorkflowTemplate" ADD CONSTRAINT "OrgWorkflowTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgWorkflowTemplate" ADD CONSTRAINT "OrgWorkflowTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgWorkflowTemplateTask" ADD CONSTRAINT "OrgWorkflowTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OrgWorkflowTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgWorkflowTemplateTask" ADD CONSTRAINT "OrgWorkflowTemplateTask_trainingModuleId_fkey" FOREIGN KEY ("trainingModuleId") REFERENCES "AgentTrainingModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgWorkflowTemplateTask" ADD CONSTRAINT "OrgWorkflowTemplateTask_orgFileId_fkey" FOREIGN KEY ("orgFileId") REFERENCES "OrgFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkflowTask" ADD CONSTRAINT "AgentWorkflowTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkflowTask" ADD CONSTRAINT "AgentWorkflowTask_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkflowTask" ADD CONSTRAINT "AgentWorkflowTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OrgWorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkflowTask" ADD CONSTRAINT "AgentWorkflowTask_templateTaskId_fkey" FOREIGN KEY ("templateTaskId") REFERENCES "OrgWorkflowTemplateTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkflowTask" ADD CONSTRAINT "AgentWorkflowTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkflowTask" ADD CONSTRAINT "AgentWorkflowTask_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkflowTask" ADD CONSTRAINT "AgentWorkflowTask_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "OrgTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferIntent" ADD CONSTRAINT "OfferIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferIntent" ADD CONSTRAINT "OfferIntent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferIntent" ADD CONSTRAINT "OfferIntent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferIntent" ADD CONSTRAINT "OfferIntent_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferIntent" ADD CONSTRAINT "OfferIntent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "OrgTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferIntent" ADD CONSTRAINT "OfferIntent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "OrgConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalProperty" ADD CONSTRAINT "RentalProperty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalProperty" ADD CONSTRAINT "RentalProperty_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalUnit" ADD CONSTRAINT "RentalUnit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RentalProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalLease" ADD CONSTRAINT "RentalLease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalLease" ADD CONSTRAINT "RentalLease_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalLease" ADD CONSTRAINT "RentalLease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "RentalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalLease" ADD CONSTRAINT "RentalLease_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "OrgTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTaxSchedule" ADD CONSTRAINT "RentalTaxSchedule_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "RentalLease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlsFeedConfig" ADD CONSTRAINT "MlsFeedConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlsSyncRun" ADD CONSTRAINT "MlsSyncRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSearchIndex" ADD CONSTRAINT "ListingSearchIndex_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSearchIndex" ADD CONSTRAINT "ListingSearchIndex_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_searchIndexId_fkey" FOREIGN KEY ("searchIndexId") REFERENCES "ListingSearchIndex"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearchAlertEvent" ADD CONSTRAINT "SavedSearchAlertEvent_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotInsight" ADD CONSTRAINT "AiCopilotInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotInsight" ADD CONSTRAINT "AiCopilotInsight_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotActionRecommendation" ADD CONSTRAINT "AiCopilotActionRecommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotActionRecommendation" ADD CONSTRAINT "AiCopilotActionRecommendation_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotActionRecommendation" ADD CONSTRAINT "AiCopilotActionRecommendation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotActionRecommendation" ADD CONSTRAINT "AiCopilotActionRecommendation_orgListingId_fkey" FOREIGN KEY ("orgListingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotActionRecommendation" ADD CONSTRAINT "AiCopilotActionRecommendation_orgTransactionId_fkey" FOREIGN KEY ("orgTransactionId") REFERENCES "OrgTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotActionRecommendation" ADD CONSTRAINT "AiCopilotActionRecommendation_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "RentalLease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCopilotActionRecommendation" ADD CONSTRAINT "AiCopilotActionRecommendation_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingIntegrationConfig" ADD CONSTRAINT "AccountingIntegrationConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionAccountingRecord" ADD CONSTRAINT "TransactionAccountingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionAccountingRecord" ADD CONSTRAINT "TransactionAccountingRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "OrgTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalLeaseAccountingRecord" ADD CONSTRAINT "RentalLeaseAccountingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalLeaseAccountingRecord" ADD CONSTRAINT "RentalLeaseAccountingRecord_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "RentalLease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksConnection" ADD CONSTRAINT "QuickBooksConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScoreHistory" ADD CONSTRAINT "LeadScoreHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScoreHistory" ADD CONSTRAINT "LeadScoreHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DripCampaign" ADD CONSTRAINT "DripCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DripStep" ADD CONSTRAINT "DripStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DripCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueForecast" ADD CONSTRAINT "RevenueForecast_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFolder" ADD CONSTRAINT "OrgFolder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFolder" ADD CONSTRAINT "OrgFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFolder" ADD CONSTRAINT "OrgFolder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFile" ADD CONSTRAINT "OrgFile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFile" ADD CONSTRAINT "OrgFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "OrgFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFile" ADD CONSTRAINT "OrgFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFile" ADD CONSTRAINT "OrgFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFile" ADD CONSTRAINT "OrgFile_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFile" ADD CONSTRAINT "OrgFile_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "OrgTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFile" ADD CONSTRAINT "OrgFile_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "RentalLease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFileVersion" ADD CONSTRAINT "OrgFileVersion_orgFileId_fkey" FOREIGN KEY ("orgFileId") REFERENCES "OrgFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFileVersion" ADD CONSTRAINT "OrgFileVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_orgFileId_fkey" FOREIGN KEY ("orgFileId") REFERENCES "OrgFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFileComment" ADD CONSTRAINT "OrgFileComment_orgFileId_fkey" FOREIGN KEY ("orgFileId") REFERENCES "OrgFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFileComment" ADD CONSTRAINT "OrgFileComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFileComment" ADD CONSTRAINT "OrgFileComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformanceSnapshot" ADD CONSTRAINT "AgentPerformanceSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformanceSnapshot" ADD CONSTRAINT "AgentPerformanceSnapshot_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchVector" ADD CONSTRAINT "SearchVector_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivePresence" ADD CONSTRAINT "LivePresence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivePresence" ADD CONSTRAINT "LivePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookTrigger" ADD CONSTRAINT "PlaybookTrigger_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookAction" ADD CONSTRAINT "PlaybookAction_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRun" ADD CONSTRAINT "PlaybookRun_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgEvent" ADD CONSTRAINT "OrgEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgEvent" ADD CONSTRAINT "OrgEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInvite" ADD CONSTRAINT "AgentInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInvite" ADD CONSTRAINT "AgentInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInvite" ADD CONSTRAINT "AgentInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegatedAccess" ADD CONSTRAINT "DelegatedAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegatedAccess" ADD CONSTRAINT "DelegatedAccess_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegatedAccess" ADD CONSTRAINT "DelegatedAccess_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldSet" ADD CONSTRAINT "FieldSet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldSet" ADD CONSTRAINT "FieldSet_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAutomation" ADD CONSTRAINT "PipelineAutomation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAutomation" ADD CONSTRAINT "PipelineAutomation_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFit" ADD CONSTRAINT "LeadFit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFit" ADD CONSTRAINT "LeadFit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityRollup" ADD CONSTRAINT "LeadActivityRollup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityRollup" ADD CONSTRAINT "LeadActivityRollup_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTouchpoint" ADD CONSTRAINT "LeadTouchpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTouchpoint" ADD CONSTRAINT "LeadTouchpoint_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTouchpoint" ADD CONSTRAINT "LeadTouchpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHistory" ADD CONSTRAINT "LeadHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHistory" ADD CONSTRAINT "LeadHistory_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHistory" ADD CONSTRAINT "LeadHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAnalyticsEvent" ADD CONSTRAINT "ClientAnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewPreset" ADD CONSTRAINT "ViewPreset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewPresetShareToken" ADD CONSTRAINT "ViewPresetShareToken_viewPresetId_fkey" FOREIGN KEY ("viewPresetId") REFERENCES "ViewPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerPortalConfig" ADD CONSTRAINT "ConsumerPortalConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumerPortalConfig" ADD CONSTRAINT "ConsumerPortalConfig_viewPresetId_fkey" FOREIGN KEY ("viewPresetId") REFERENCES "ViewPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStepLog" ADD CONSTRAINT "SequenceStepLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStepLog" ADD CONSTRAINT "SequenceStepLog_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStepLog" ADD CONSTRAINT "SequenceStepLog_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "SequenceEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignStep" ADD CONSTRAINT "CampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignStep" ADD CONSTRAINT "CampaignStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEnrollment" ADD CONSTRAINT "CampaignEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEnrollment" ADD CONSTRAINT "CampaignEnrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEnrollment" ADD CONSTRAINT "CampaignEnrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEnrollment" ADD CONSTRAINT "CampaignEnrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEvent" ADD CONSTRAINT "OutreachEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEvent" ADD CONSTRAINT "OutreachEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEvent" ADD CONSTRAINT "OutreachEvent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CampaignEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldLayout" ADD CONSTRAINT "CustomFieldLayout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldLayout" ADD CONSTRAINT "CustomFieldLayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldLayout" ADD CONSTRAINT "CustomFieldLayout_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeProposal" ADD CONSTRAINT "ContactMergeProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeProposal" ADD CONSTRAINT "ContactMergeProposal_existingPersonId_fkey" FOREIGN KEY ("existingPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeProposal" ADD CONSTRAINT "ContactMergeProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeProposal" ADD CONSTRAINT "ContactMergeProposal_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_overrideUserId_fkey" FOREIGN KEY ("overrideUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MLSProfile" ADD CONSTRAINT "MLSProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourAgreementLink" ADD CONSTRAINT "TourAgreementLink_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourAgreementLink" ADD CONSTRAINT "TourAgreementLink_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclaimerPolicy" ADD CONSTRAINT "DisclaimerPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclaimerPolicy" ADD CONSTRAINT "DisclaimerPolicy_mlsProfileId_fkey" FOREIGN KEY ("mlsProfileId") REFERENCES "MLSProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideLog" ADD CONSTRAINT "OverrideLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideLog" ADD CONSTRAINT "OverrideLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEvent" ADD CONSTRAINT "MarketingEvent_mlsProfileId_fkey" FOREIGN KEY ("mlsProfileId") REFERENCES "MLSProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceStatusDaily" ADD CONSTRAINT "ComplianceStatusDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAssignment" ADD CONSTRAINT "PlanAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAssignment" ADD CONSTRAINT "PlanAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanAssignment" ADD CONSTRAINT "PlanAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapLedger" ADD CONSTRAINT "CapLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapLedger" ADD CONSTRAINT "CapLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapLedger" ADD CONSTRAINT "CapLedger_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSnapshot" ADD CONSTRAINT "PlanSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSnapshot" ADD CONSTRAINT "PlanSnapshot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSnapshot" ADD CONSTRAINT "PlanSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRouteEvent" ADD CONSTRAINT "LeadRouteEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRouteEvent" ADD CONSTRAINT "LeadRouteEvent_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "RoutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRouteEvent" ADD CONSTRAINT "LeadRouteEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueAssignment" ADD CONSTRAINT "QueueAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueAssignment" ADD CONSTRAINT "QueueAssignment_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueAssignment" ADD CONSTRAINT "QueueAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueAssignment" ADD CONSTRAINT "QueueAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSlaTimer" ADD CONSTRAINT "LeadSlaTimer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSlaTimer" ADD CONSTRAINT "LeadSlaTimer_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RoutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ConversationParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbox" ADD CONSTRAINT "Outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentReason" ADD CONSTRAINT "AssignmentReason_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneySimulation" ADD CONSTRAINT "JourneySimulation_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneySimulation" ADD CONSTRAINT "JourneySimulation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneySimulation" ADD CONSTRAINT "JourneySimulation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationBlock" ADD CONSTRAINT "CommunicationBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationBlock" ADD CONSTRAINT "CommunicationBlock_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearCooperationTimer" ADD CONSTRAINT "ClearCooperationTimer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearCooperationTimer" ADD CONSTRAINT "ClearCooperationTimer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearCooperationTimer" ADD CONSTRAINT "ClearCooperationTimer_mlsProfileId_fkey" FOREIGN KEY ("mlsProfileId") REFERENCES "MLSProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearCooperationTimer" ADD CONSTRAINT "ClearCooperationTimer_lastActorId_fkey" FOREIGN KEY ("lastActorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocument" ADD CONSTRAINT "PersonDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverabilityMetric" ADD CONSTRAINT "DeliverabilityMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverabilityMetric" ADD CONSTRAINT "DeliverabilityMetric_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuietHourOverride" ADD CONSTRAINT "QuietHourOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuietHourOverride" ADD CONSTRAINT "QuietHourOverride_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingLog" ADD CONSTRAINT "RoutingLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingLog" ADD CONSTRAINT "RoutingLog_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "Outbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrgMembership" ADD CONSTRAINT "UserOrgMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrgMembership" ADD CONSTRAINT "UserOrgMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrgMembership" ADD CONSTRAINT "UserOrgMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrgMembership" ADD CONSTRAINT "UserOrgMembership_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSet" ADD CONSTRAINT "PermissionSet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSetAssignment" ADD CONSTRAINT "PermissionSetAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSetAssignment" ADD CONSTRAINT "PermissionSetAssignment_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectPermission" ADD CONSTRAINT "ObjectPermission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectPermission" ADD CONSTRAINT "ObjectPermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectPermission" ADD CONSTRAINT "ObjectPermission_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldPermission" ADD CONSTRAINT "FieldPermission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldPermission" ADD CONSTRAINT "FieldPermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldPermission" ADD CONSTRAINT "FieldPermission_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordShare" ADD CONSTRAINT "RecordShare_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLink" ADD CONSTRAINT "FileLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectLayout" ADD CONSTRAINT "ObjectLayout_recordTypeId_fkey" FOREIGN KEY ("recordTypeId") REFERENCES "RecordType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldLayout" ADD CONSTRAINT "FieldLayout_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "ObjectLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgDailyAnalytics" ADD CONSTRAINT "OrgDailyAnalytics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDailyAnalytics" ADD CONSTRAINT "AgentDailyAnalytics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDailyAnalytics" ADD CONSTRAINT "AgentDailyAnalytics_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

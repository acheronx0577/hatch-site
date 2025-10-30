/*
  Warnings:

  - You are about to drop the column `clearCoopTimerId` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `payload` on the `RoutingLog` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[listingId]` on the table `ClearCooperationTimer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,primaryEmail]` on the table `Person` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,primaryPhone]` on the table `Person` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ruleName` to the `RoutingLog` table without a default value. This is not possible if the table is not empty.
  - Made the column `status` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "RoutingMode" AS ENUM ('FIRST_MATCH', 'SCORE_AND_ASSIGN');

-- CreateEnum
CREATE TYPE "LeadSlaType" AS ENUM ('FIRST_TOUCH', 'KEPT_APPOINTMENT');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'PORTAL', 'OPEN_HOUSE', 'API', 'REFERRAL');

-- CreateEnum
CREATE TYPE "LeadScoreTier" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "LeadTaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "LeadTouchpointType" AS ENUM ('MESSAGE', 'CALL', 'MEETING', 'TASK', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionPlanType" AS ENUM ('FLAT', 'TIERED', 'CAP');

-- CreateEnum
CREATE TYPE "PlanAssigneeType" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('SHOWING', 'MEETING', 'INSPECTION', 'CLOSING', 'FOLLOW_UP', 'MARKETING', 'OTHER');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarEventPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'COMMISSION_PLAN_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'COMMISSION_PLAN_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'COMMISSION_PLAN_ARCHIVED';
ALTER TYPE "ActivityType" ADD VALUE 'COMMISSION_PLAN_ASSIGNED';
ALTER TYPE "ActivityType" ADD VALUE 'COMMISSION_PLAN_ASSIGNMENT_ENDED';
ALTER TYPE "ActivityType" ADD VALUE 'CAP_LEDGER_UPDATED';

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Agreement" DROP CONSTRAINT "Agreement_personId_fkey";

-- DropForeignKey
ALTER TABLE "Agreement" DROP CONSTRAINT "Agreement_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_personId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actorId_fkey";

-- DropForeignKey
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_orgId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ClearCooperationTimer" DROP CONSTRAINT "ClearCooperationTimer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CommunicationBlock" DROP CONSTRAINT "CommunicationBlock_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Consent" DROP CONSTRAINT "Consent_personId_fkey";

-- DropForeignKey
ALTER TABLE "Consent" DROP CONSTRAINT "Consent_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ContactMergeProposal" DROP CONSTRAINT "ContactMergeProposal_existingPersonId_fkey";

-- DropForeignKey
ALTER TABLE "ContactMergeProposal" DROP CONSTRAINT "ContactMergeProposal_proposedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ContactMergeProposal" DROP CONSTRAINT "ContactMergeProposal_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationParticipant" DROP CONSTRAINT "ConversationParticipant_personId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationParticipant" DROP CONSTRAINT "ConversationParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_personId_fkey";

-- DropForeignKey
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "DeliverabilityMetric" DROP CONSTRAINT "DeliverabilityMetric_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "FieldPermission" DROP CONSTRAINT "FieldPermission_orgId_fkey";

-- DropForeignKey
ALTER TABLE "FieldPermission" DROP CONSTRAINT "FieldPermission_permissionSetId_fkey";

-- DropForeignKey
ALTER TABLE "FieldPermission" DROP CONSTRAINT "FieldPermission_profileId_fkey";

-- DropForeignKey
ALTER TABLE "Journey" DROP CONSTRAINT "Journey_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MLSProfile" DROP CONSTRAINT "MLSProfile_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ObjectPermission" DROP CONSTRAINT "ObjectPermission_orgId_fkey";

-- DropForeignKey
ALTER TABLE "ObjectPermission" DROP CONSTRAINT "ObjectPermission_permissionSetId_fkey";

-- DropForeignKey
ALTER TABLE "ObjectPermission" DROP CONSTRAINT "ObjectPermission_profileId_fkey";

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_listingId_fkey";

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_personId_fkey";

-- DropForeignKey
ALTER TABLE "Offer" DROP CONSTRAINT "Offer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Outbox" DROP CONSTRAINT "Outbox_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PermissionSet" DROP CONSTRAINT "PermissionSet_orgId_fkey";

-- DropForeignKey
ALTER TABLE "PermissionSetAssignment" DROP CONSTRAINT "PermissionSetAssignment_permissionSetId_fkey";

-- DropForeignKey
ALTER TABLE "PermissionSetAssignment" DROP CONSTRAINT "PermissionSetAssignment_userId_fkey";

-- DropForeignKey
ALTER TABLE "Person" DROP CONSTRAINT "Person_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Person" DROP CONSTRAINT "Person_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PersonDocument" DROP CONSTRAINT "PersonDocument_personId_fkey";

-- DropForeignKey
ALTER TABLE "PersonDocument" DROP CONSTRAINT "PersonDocument_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_orgId_fkey";

-- DropForeignKey
ALTER TABLE "QuietHourOverride" DROP CONSTRAINT "QuietHourOverride_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "RecordShare" DROP CONSTRAINT "RecordShare_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Role" DROP CONSTRAINT "Role_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Role" DROP CONSTRAINT "Role_parentId_fkey";

-- DropForeignKey
ALTER TABLE "RoutingLog" DROP CONSTRAINT "RoutingLog_personId_fkey";

-- DropForeignKey
ALTER TABLE "RoutingLog" DROP CONSTRAINT "RoutingLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SavedView" DROP CONSTRAINT "SavedView_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SavedView" DROP CONSTRAINT "SavedView_userId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMembership" DROP CONSTRAINT "TeamMembership_teamId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMembership" DROP CONSTRAINT "TeamMembership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Tenant" DROP CONSTRAINT "Tenant_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Tour" DROP CONSTRAINT "Tour_listingId_fkey";

-- DropForeignKey
ALTER TABLE "Tour" DROP CONSTRAINT "Tour_personId_fkey";

-- DropForeignKey
ALTER TABLE "Tour" DROP CONSTRAINT "Tour_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrgMembership" DROP CONSTRAINT "UserOrgMembership_orgId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrgMembership" DROP CONSTRAINT "UserOrgMembership_profileId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrgMembership" DROP CONSTRAINT "UserOrgMembership_roleId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrgMembership" DROP CONSTRAINT "UserOrgMembership_userId_fkey";

-- DropForeignKey
ALTER TABLE "WebhookDelivery" DROP CONSTRAINT "WebhookDelivery_outboxId_fkey";

-- DropForeignKey
ALTER TABLE "WebhookDelivery" DROP CONSTRAINT "WebhookDelivery_webhookId_fkey";

-- DropForeignKey
ALTER TABLE "WebhookSubscription" DROP CONSTRAINT "WebhookSubscription_tenantId_fkey";

-- DropIndex
DROP INDEX "Person_tenantId_idx";
DROP INDEX IF EXISTS "Person_tenantId_primaryEmail_key";
DROP INDEX IF EXISTS "Person_tenantId_primaryPhone_key";

-- AlterTable
ALTER TABLE "Agreement" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AuditEvent" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClearCooperationTimer" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "firstPublicMarketingAt" TIMESTAMP(3),
ADD COLUMN     "lastAction" TEXT,
ADD COLUMN     "lastActorId" TEXT,
ADD COLUMN     "mlsProfileId" TEXT,
ADD COLUMN     "riskReason" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Consent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ContactMergeProposal" ALTER COLUMN "resolvedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "archivedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ConversationParticipant" ALTER COLUMN "joinedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "lastReadAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Deal" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FieldPermission" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Journey" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Listing" DROP COLUMN "clearCoopTimerId",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MLSProfile" ADD COLUMN     "prohibitedFields" JSONB,
ADD COLUMN     "requiredPlacement" TEXT DEFAULT 'footer',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MessageAttachment" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MessageReceipt" ALTER COLUMN "recordedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ObjectPermission" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Offer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Outbox" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PermissionSet" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PermissionSetAssignment" ALTER COLUMN "assignedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "gclid" TEXT,
ADD COLUMN     "pipelineId" TEXT,
ADD COLUMN     "scoreTier" "LeadScoreTier" NOT NULL DEFAULT 'D',
ADD COLUMN     "scoreUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3),
ADD COLUMN     "stageId" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "lastActivityAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RecordShare" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RoutingLog" DROP COLUMN "payload",
ADD COLUMN     "details" JSONB,
ADD COLUMN     "newOwnerId" TEXT,
ADD COLUMN     "prevOwnerId" TEXT,
ADD COLUMN     "ruleName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SavedView" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tour" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserOrgMembership" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WebhookSubscription" ALTER COLUMN "updatedAt" DROP DEFAULT;

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
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
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
    "slaMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "team_members_tenant_id_idx" ON "team_members"("tenant_id");

-- CreateIndex
CREATE INDEX "team_members_org_id_idx" ON "team_members"("org_id");

-- CreateIndex
CREATE INDEX "Pipeline_tenantId_idx" ON "Pipeline"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_tenantId_name_key" ON "Pipeline"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Stage_tenantId_idx" ON "Stage"("tenantId");

-- CreateIndex
CREATE INDEX "Stage_tenantId_pipelineId_idx" ON "Stage"("tenantId", "pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_tenantId_pipelineId_name_key" ON "Stage"("tenantId", "pipelineId", "name");

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
CREATE INDEX "CalendarEvent_tenantId_startAt_idx" ON "CalendarEvent"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_assignedAgentId_idx" ON "CalendarEvent"("assignedAgentId");

-- CreateIndex
CREATE INDEX "CalendarEvent_personId_idx" ON "CalendarEvent"("personId");

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
CREATE INDEX "LeadSlaTimer_tenantId_leadId_idx" ON "LeadSlaTimer"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "LeadSlaTimer_tenantId_status_idx" ON "LeadSlaTimer"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClearCooperationTimer_listingId_key" ON "ClearCooperationTimer"("listingId");

-- CreateIndex
CREATE INDEX "Person_tenantId_pipelineId_idx" ON "Person"("tenantId", "pipelineId");

-- CreateIndex
CREATE INDEX "Person_tenantId_stageId_idx" ON "Person"("tenantId", "stageId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_tenantId_primaryEmail_key" ON "Person"("tenantId", "primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Person_tenantId_primaryPhone_key" ON "Person"("tenantId", "primaryPhone");

-- CreateIndex
CREATE INDEX "RoutingLog_tenantId_personId_idx" ON "RoutingLog"("tenantId", "personId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeProposal" ADD CONSTRAINT "ContactMergeProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeProposal" ADD CONSTRAINT "ContactMergeProposal_existingPersonId_fkey" FOREIGN KEY ("existingPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMergeProposal" ADD CONSTRAINT "ContactMergeProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "LeadSlaTimer" ADD CONSTRAINT "LeadSlaTimer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSlaTimer" ADD CONSTRAINT "LeadSlaTimer_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RoutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbox" ADD CONSTRAINT "Outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationBlock" ADD CONSTRAINT "CommunicationBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearCooperationTimer" ADD CONSTRAINT "ClearCooperationTimer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "DeliverabilityMetric" ADD CONSTRAINT "DeliverabilityMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuietHourOverride" ADD CONSTRAINT "QuietHourOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- RenameIndex
ALTER INDEX "Agreement_person_type_status_idx" RENAME TO "Agreement_personId_type_status_idx";

-- RenameIndex
ALTER INDEX "AuditEvent_org_object_record_idx" RENAME TO "AuditEvent_orgId_object_recordId_idx";

-- RenameIndex
ALTER INDEX "CommunicationBlock_person_channel_idx" RENAME TO "CommunicationBlock_personId_channel_idx";

-- RenameIndex
ALTER INDEX "Consent_person_channel_scope_idx" RENAME TO "Consent_personId_channel_scope_idx";

-- RenameIndex
ALTER INDEX "ContactMergeProposal_tenant_status_idx" RENAME TO "ContactMergeProposal_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "Conversation_tenant_person_idx" RENAME TO "Conversation_tenantId_personId_idx";

-- RenameIndex
ALTER INDEX "Conversation_tenant_type_idx" RENAME TO "Conversation_tenantId_type_idx";

-- RenameIndex
ALTER INDEX "Conversation_tenant_updated_idx" RENAME TO "Conversation_tenantId_updatedAt_idx";

-- RenameIndex
ALTER INDEX "ConversationParticipant_conversation_person_idx" RENAME TO "ConversationParticipant_conversationId_personId_idx";

-- RenameIndex
ALTER INDEX "ConversationParticipant_conversation_role_idx" RENAME TO "ConversationParticipant_conversationId_role_idx";

-- RenameIndex
ALTER INDEX "ConversationParticipant_conversation_user_idx" RENAME TO "ConversationParticipant_conversationId_userId_idx";

-- RenameIndex
ALTER INDEX "DeliverabilityMetric_tenant_agent_channel_date_key" RENAME TO "DeliverabilityMetric_tenantId_agentId_channel_recordedAt_key";

-- RenameIndex
ALTER INDEX "FieldPermission_org_holder_object_field_idx" RENAME TO "FieldPermission_orgId_holderType_holderId_object_field_idx";

-- RenameIndex
ALTER INDEX "FieldPermission_permission_set_idx" RENAME TO "FieldPermission_permissionSetId_idx";

-- RenameIndex
ALTER INDEX "FieldPermission_profile_idx" RENAME TO "FieldPermission_profileId_idx";

-- RenameIndex
ALTER INDEX "MessageReceipt_message_participant_status_key" RENAME TO "MessageReceipt_messageId_participantId_status_key";

-- RenameIndex
ALTER INDEX "MessageReceipt_participant_status_idx" RENAME TO "MessageReceipt_participantId_status_idx";

-- RenameIndex
ALTER INDEX "ObjectPermission_org_holder_object_idx" RENAME TO "ObjectPermission_orgId_holderType_holderId_object_idx";

-- RenameIndex
ALTER INDEX "ObjectPermission_permission_set_idx" RENAME TO "ObjectPermission_permissionSetId_idx";

-- RenameIndex
ALTER INDEX "ObjectPermission_profile_idx" RENAME TO "ObjectPermission_profileId_idx";

-- RenameIndex
ALTER INDEX "RecordShare_org_object_record_idx" RENAME TO "RecordShare_orgId_object_recordId_idx";

-- RenameIndex
ALTER INDEX "SavedView_user_name_key" RENAME TO "SavedView_userId_name_key";

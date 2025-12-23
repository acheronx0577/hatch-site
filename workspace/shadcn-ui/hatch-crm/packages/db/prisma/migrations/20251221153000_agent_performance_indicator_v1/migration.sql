-- CreateEnum
CREATE TYPE "AgentPerformanceConfidenceBand" AS ENUM ('HIGH', 'MEDIUM', 'DEVELOPING');

-- AlterTable
ALTER TABLE "AgentPerformanceSnapshot"
ADD COLUMN     "modelVersion" TEXT NOT NULL DEFAULT 'API_v1',
ADD COLUMN     "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "confidenceBand" "AgentPerformanceConfidenceBand" NOT NULL DEFAULT 'DEVELOPING',
ADD COLUMN     "historicalEffectivenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "responsivenessReliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "recencyMomentumScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "opportunityFitScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "riskDragPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "capacityLoadScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "topDrivers" JSONB,
ADD COLUMN     "rawFeatureSummary" JSONB;

-- CreateTable
CREATE TABLE "AgentPerformanceWeights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "weightHistoricalEffectiveness" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "weightResponsivenessReliability" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "weightRecencyMomentum" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "weightOpportunityFit" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "weightCapacityLoad" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "maxRiskDragPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "highBandThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "mediumBandThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPerformanceWeights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPerformanceLatest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPerformanceLatest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPerformanceContextScore" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentProfileId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "fitScore" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPerformanceContextScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentPerformanceSnapshot_organizationId_agentProfileId_modelVersion_createdAt_idx" ON "AgentPerformanceSnapshot"("organizationId", "agentProfileId", "modelVersion", "createdAt");

-- CreateIndex
CREATE INDEX "AgentPerformanceSnapshot_organizationId_modelVersion_createdAt_idx" ON "AgentPerformanceSnapshot"("organizationId", "modelVersion", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPerformanceWeights_organizationId_modelVersion_key" ON "AgentPerformanceWeights"("organizationId", "modelVersion");

-- CreateIndex
CREATE INDEX "AgentPerformanceWeights_organizationId_idx" ON "AgentPerformanceWeights"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPerformanceLatest_organizationId_agentProfileId_modelVersion_key" ON "AgentPerformanceLatest"("organizationId", "agentProfileId", "modelVersion");

-- CreateIndex
CREATE INDEX "AgentPerformanceLatest_organizationId_modelVersion_idx" ON "AgentPerformanceLatest"("organizationId", "modelVersion");

-- CreateIndex
CREATE INDEX "AgentPerformanceLatest_organizationId_agentProfileId_idx" ON "AgentPerformanceLatest"("organizationId", "agentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPerformanceContextScore_organizationId_agentProfileId_modelVersion_contextKey_key" ON "AgentPerformanceContextScore"("organizationId", "agentProfileId", "modelVersion", "contextKey");

-- CreateIndex
CREATE INDEX "AgentPerformanceContextScore_organizationId_modelVersion_contextKey_idx" ON "AgentPerformanceContextScore"("organizationId", "modelVersion", "contextKey");

-- CreateIndex
CREATE INDEX "AgentPerformanceContextScore_organizationId_agentProfileId_idx" ON "AgentPerformanceContextScore"("organizationId", "agentProfileId");

-- AddForeignKey
ALTER TABLE "AgentPerformanceWeights" ADD CONSTRAINT "AgentPerformanceWeights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformanceLatest" ADD CONSTRAINT "AgentPerformanceLatest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformanceLatest" ADD CONSTRAINT "AgentPerformanceLatest_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformanceLatest" ADD CONSTRAINT "AgentPerformanceLatest_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "AgentPerformanceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformanceContextScore" ADD CONSTRAINT "AgentPerformanceContextScore_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPerformanceContextScore" ADD CONSTRAINT "AgentPerformanceContextScore_agentProfileId_fkey" FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


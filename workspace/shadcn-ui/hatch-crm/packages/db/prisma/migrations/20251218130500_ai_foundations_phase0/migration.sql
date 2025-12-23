-- CreateTable
CREATE TABLE "AiPromptTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "systemPrompt" TEXT NOT NULL,
    "userPromptTemplate" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "maxTokens" INTEGER,
    "temperature" DOUBLE PRECISION,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" DOUBLE PRECISION,
    "avgTokens" DOUBLE PRECISION,
    "feedbackScore" DOUBLE PRECISION,

    CONSTRAINT "AiPromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPendingAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "generatedContent" TEXT NOT NULL,
    "contentPreview" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "originalRequest" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionResult" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DECIMAL(10,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorType" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "piiRedacted" BOOLEAN NOT NULL,
    "guardrailsApplied" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageBudget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monthlyBudget" DECIMAL(10,2),
    "alertThreshold" DECIMAL(3,2) NOT NULL,
    "hardLimit" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodUsage" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "alertsSent" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiPromptTemplate_organizationId_feature_isActive_idx" ON "AiPromptTemplate"("organizationId", "feature", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AiPromptTemplate_organizationId_feature_version_key" ON "AiPromptTemplate"("organizationId", "feature", "version");

-- CreateIndex
CREATE INDEX "AiPendingAction_organizationId_status_idx" ON "AiPendingAction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AiPendingAction_expiresAt_idx" ON "AiPendingAction"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageLog_requestId_key" ON "AiUsageLog"("requestId");

-- CreateIndex
CREATE INDEX "AiUsageLog_organizationId_createdAt_idx" ON "AiUsageLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_feature_createdAt_idx" ON "AiUsageLog"("feature", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageBudget_organizationId_key" ON "AiUsageBudget"("organizationId");

-- AddForeignKey
ALTER TABLE "AiPromptTemplate" ADD CONSTRAINT "AiPromptTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPromptTemplate" ADD CONSTRAINT "AiPromptTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPendingAction" ADD CONSTRAINT "AiPendingAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPendingAction" ADD CONSTRAINT "AiPendingAction_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPendingAction" ADD CONSTRAINT "AiPendingAction_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageBudget" ADD CONSTRAINT "AiUsageBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


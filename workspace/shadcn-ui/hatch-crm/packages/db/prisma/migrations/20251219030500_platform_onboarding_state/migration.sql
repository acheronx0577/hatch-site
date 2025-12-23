-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'welcome',
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skippedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conversationHistory" JSONB NOT NULL DEFAULT '[]',
    "pendingConfig" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "totalTime" INTEGER,

    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingState_organizationId_key" ON "OnboardingState"("organizationId");

-- CreateIndex
CREATE INDEX "OnboardingState_organizationId_idx" ON "OnboardingState"("organizationId");

-- CreateIndex
CREATE INDEX "OnboardingState_status_idx" ON "OnboardingState"("status");

-- AddForeignKey
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


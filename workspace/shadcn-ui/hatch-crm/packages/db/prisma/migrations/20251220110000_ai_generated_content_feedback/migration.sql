-- CreateTable
CREATE TABLE "AiGeneratedContent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "promptTemplate" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "generatedContent" TEXT NOT NULL,
    "originalRequest" JSONB NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "parentRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGeneratedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiGeneratedContent_requestId_key" ON "AiGeneratedContent"("requestId");

-- CreateIndex
CREATE INDEX "AiGeneratedContent_organizationId_feature_createdAt_idx" ON "AiGeneratedContent"("organizationId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneratedContent_organizationId_entityType_entityId_idx" ON "AiGeneratedContent"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiGeneratedContent_organizationId_parentRequestId_idx" ON "AiGeneratedContent"("organizationId", "parentRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeedback_requestId_userId_key" ON "AiFeedback"("requestId", "userId");

-- CreateIndex
CREATE INDEX "AiFeedback_organizationId_feature_createdAt_idx" ON "AiFeedback"("organizationId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiFeedback_organizationId_requestId_idx" ON "AiFeedback"("organizationId", "requestId");

-- AddForeignKey
ALTER TABLE "AiGeneratedContent" ADD CONSTRAINT "AiGeneratedContent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneratedContent" ADD CONSTRAINT "AiGeneratedContent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


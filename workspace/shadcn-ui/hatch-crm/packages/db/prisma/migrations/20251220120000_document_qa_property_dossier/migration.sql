-- CreateTable
CREATE TABLE "DocumentUpload" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "fullText" TEXT,
    "pageCount" INTEGER,
    "entityType" TEXT,
    "entityId" TEXT,
    "documentType" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "content" TEXT NOT NULL,
    "embeddingF8" DOUBLE PRECISION[] NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentQaHistory" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentQaHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyDossier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT,
    "address" TEXT NOT NULL,
    "dossier" JSONB NOT NULL,
    "sourceDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyDossier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentUpload_organizationId_status_createdAt_idx" ON "DocumentUpload"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentUpload_organizationId_entityType_entityId_idx" ON "DocumentUpload"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key" ON "DocumentChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE INDEX "DocumentQaHistory_documentId_createdAt_idx" ON "DocumentQaHistory"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentQaHistory_userId_createdAt_idx" ON "DocumentQaHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PropertyDossier_organizationId_createdAt_idx" ON "PropertyDossier"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PropertyDossier_organizationId_listingId_idx" ON "PropertyDossier"("organizationId", "listingId");

-- AddForeignKey
ALTER TABLE "DocumentUpload" ADD CONSTRAINT "DocumentUpload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUpload" ADD CONSTRAINT "DocumentUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentQaHistory" ADD CONSTRAINT "DocumentQaHistory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentQaHistory" ADD CONSTRAINT "DocumentQaHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDossier" ADD CONSTRAINT "PropertyDossier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDossier" ADD CONSTRAINT "PropertyDossier_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "OrgListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDossier" ADD CONSTRAINT "PropertyDossier_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

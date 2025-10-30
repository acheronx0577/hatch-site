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

-- CreateIndex
CREATE UNIQUE INDEX "RecordType_orgId_object_key_key" ON "RecordType"("orgId", "object", "key");

-- CreateIndex
CREATE INDEX "RecordType_orgId_object_idx" ON "RecordType"("orgId", "object");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectLayout_orgId_object_kind_recordTypeId_profile_key" ON "ObjectLayout"("orgId", "object", "kind", "recordTypeId", "profile");

-- CreateIndex
CREATE INDEX "ObjectLayout_orgId_object_kind_idx" ON "ObjectLayout"("orgId", "object", "kind");

-- CreateIndex
CREATE INDEX "ObjectLayout_orgId_object_kind_profile_idx" ON "ObjectLayout"("orgId", "object", "kind", "profile");

-- CreateIndex
CREATE INDEX "ObjectLayout_orgId_object_kind_recordTypeId_profile_idx" ON "ObjectLayout"("orgId", "object", "kind", "recordTypeId", "profile");

-- CreateIndex
CREATE INDEX "FieldLayout_layoutId_order_idx" ON "FieldLayout"("layoutId", "order");

-- AddForeignKey
ALTER TABLE "ObjectLayout" ADD CONSTRAINT "ObjectLayout_recordTypeId_fkey" FOREIGN KEY ("recordTypeId") REFERENCES "RecordType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldLayout" ADD CONSTRAINT "FieldLayout_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "ObjectLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

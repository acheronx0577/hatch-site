-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "OrgLedgerEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "memo" TEXT,
    "transactionId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgLedgerEntry_orgId_occurredAt_idx" ON "OrgLedgerEntry"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "OrgLedgerEntry_orgId_type_occurredAt_idx" ON "OrgLedgerEntry"("orgId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "OrgLedgerEntry_orgId_category_idx" ON "OrgLedgerEntry"("orgId", "category");

-- AddForeignKey
ALTER TABLE "OrgLedgerEntry" ADD CONSTRAINT "OrgLedgerEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


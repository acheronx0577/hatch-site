-- CreateEnum
CREATE TYPE "SellerOpportunityStatus" AS ENUM ('NEW', 'CONVERTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "SellerOpportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "SellerOpportunityStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '[]',
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "county" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "externalMlsId" TEXT,
    "externalMlsSource" TEXT,
    "externalListingStatus" TEXT,
    "externalListPrice" INTEGER,
    "externalDaysOnMarket" INTEGER,
    "externalListingDate" TIMESTAMP(3),
    "externalStatusChangeDate" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "convertedLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerOpportunity_organizationId_dedupeKey_key" ON "SellerOpportunity"("organizationId", "dedupeKey");
CREATE INDEX "SellerOpportunity_organizationId_status_score_idx" ON "SellerOpportunity"("organizationId", "status", "score");
CREATE INDEX "SellerOpportunity_organizationId_score_idx" ON "SellerOpportunity"("organizationId", "score");

-- AddForeignKey
ALTER TABLE "SellerOpportunity" ADD CONSTRAINT "SellerOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "OfferIntentStatus" ADD VALUE 'SENT';
ALTER TYPE "OfferIntentStatus" ADD VALUE 'RECEIVED';
ALTER TYPE "OfferIntentStatus" ADD VALUE 'COUNTERED';
ALTER TYPE "OfferIntentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "OfferIntent" ADD COLUMN "buyerName" TEXT;
ALTER TABLE "OfferIntent" ADD COLUMN "sellerName" TEXT;
ALTER TABLE "OfferIntent" ADD COLUMN "expiresAt" TIMESTAMP(3);

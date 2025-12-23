-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('BUYER', 'SELLER', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "leadType" "LeadType" NOT NULL DEFAULT 'UNKNOWN';


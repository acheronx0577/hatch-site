-- AlterTable
ALTER TABLE "ContractTemplate" ADD COLUMN     "editableKeys" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];


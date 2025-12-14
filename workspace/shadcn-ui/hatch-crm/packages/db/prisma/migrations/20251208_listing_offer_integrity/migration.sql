-- Add scalar amount column to offers (keeps JSON terms but ensures a numeric value is stored)
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Reset Deal -> Listing FK to cascade on delete
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Deal_listingId_fkey'
      AND table_name = 'Deal'
  ) THEN
    ALTER TABLE "Deal" DROP CONSTRAINT "Deal_listingId_fkey";
  END IF;
END $$;

ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reset Offer -> Listing FK to cascade on delete
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Offer_listingId_fkey'
      AND table_name = 'Offer'
  ) THEN
    ALTER TABLE "Offer" DROP CONSTRAINT "Offer_listingId_fkey";
  END IF;
END $$;

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce at most one ACCEPTED offer per listing
CREATE UNIQUE INDEX IF NOT EXISTS "Offer_listingId_status_accepted_idx"
  ON "Offer"("listingId")
  WHERE "status" = 'ACCEPTED';

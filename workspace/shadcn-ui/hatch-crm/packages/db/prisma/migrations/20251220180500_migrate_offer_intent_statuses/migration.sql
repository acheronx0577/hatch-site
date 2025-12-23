-- Data migration: map legacy LOI statuses to the new lifecycle names.
UPDATE "OfferIntent" SET "status" = 'RECEIVED' WHERE "status" IN ('SUBMITTED', 'UNDER_REVIEW');
UPDATE "OfferIntent" SET "status" = 'REJECTED' WHERE "status" IN ('DECLINED', 'WITHDRAWN');

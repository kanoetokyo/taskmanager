ALTER TABLE "customer_handovers"
  ADD COLUMN IF NOT EXISTS "cancelledAt" timestamp;

-- Existing cancelled records predate the dedicated timestamp. Their most recent
-- update is the closest available record of when the status was changed.
UPDATE "customer_handovers"
SET "cancelledAt" = "updatedAt"
WHERE "status" = 'キャンセル'
  AND "cancelledAt" IS NULL;

CREATE INDEX IF NOT EXISTS "customer_handovers_cancelled_at_idx"
  ON "customer_handovers" ("cancelledAt" DESC)
  WHERE "deletedAt" IS NULL AND "status" = 'キャンセル';

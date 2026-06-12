ALTER TABLE "customer_handovers"
  ADD COLUMN IF NOT EXISTS "callCount" integer DEFAULT 0 NOT NULL;

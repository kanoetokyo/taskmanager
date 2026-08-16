-- Customer handover photo attachments. This migration is additive and does
-- not modify or remove existing customer handover records.

BEGIN;

CREATE TABLE IF NOT EXISTS "customer_handover_attachments" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "customerHandoverId" varchar(64) NOT NULL,
  "storageKey" varchar(512) NOT NULL,
  "fileName" varchar(255) NOT NULL,
  "mimeType" varchar(128) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdBy" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "customer_handover_attachments_customer_handover_fk"
    FOREIGN KEY ("customerHandoverId")
    REFERENCES "customer_handovers"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_handover_attachments_storage_key_unique"
  ON "customer_handover_attachments" ("storageKey");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_handover_attachments_customer_sort_unique"
  ON "customer_handover_attachments" ("customerHandoverId", "sortOrder");

ALTER TABLE "customer_handover_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "customer_handover_attachments" FROM anon, authenticated;

COMMIT;

-- Data safety baseline: this migration only adds columns, indexes, triggers,
-- audit history, and access controls. It never drops application data.

ALTER TABLE "task_states"
  ADD COLUMN IF NOT EXISTS "planned" varchar(64) DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;

ALTER TABLE "store_check_states"
  ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;

ALTER TABLE "individual_handovers"
  ADD COLUMN IF NOT EXISTS "completedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "updatedBy" varchar(64) DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;

ALTER TABLE "customer_handovers"
  ADD COLUMN IF NOT EXISTS "completedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "updatedBy" varchar(64) DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "entityType" varchar(64) NOT NULL,
  "entityId" varchar(128) NOT NULL,
  "action" varchar(32) NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "actorId" varchar(64),
  "requestId" varchar(128),
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_logs_entity_created_idx"
  ON "audit_logs" ("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "customer_handovers_active_idx"
  ON "customer_handovers" ("status", "updatedAt")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "individual_handovers_active_idx"
  ON "individual_handovers" ("dateKey", "updatedAt")
  WHERE "deletedAt" IS NULL AND "completed" = false;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "set_task_states_updated_at" ON "task_states";
CREATE TRIGGER "set_task_states_updated_at"
  BEFORE UPDATE ON "task_states"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_store_check_states_updated_at" ON "store_check_states";
CREATE TRIGGER "set_store_check_states_updated_at"
  BEFORE UPDATE ON "store_check_states"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_individual_handovers_updated_at" ON "individual_handovers";
CREATE TRIGGER "set_individual_handovers_updated_at"
  BEFORE UPDATE ON "individual_handovers"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_customer_handovers_updated_at" ON "customer_handovers";
CREATE TRIGGER "set_customer_handovers_updated_at"
  BEFORE UPDATE ON "customer_handovers"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE "task_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_check_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "individual_handovers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_handovers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "task_states", "store_check_states", "individual_handovers", "customer_handovers", "audit_logs" FROM anon, authenticated;

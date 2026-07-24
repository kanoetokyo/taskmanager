-- Calendar automation is additive. It stores generated one-time tasks and
-- source event IDs, never customer matching data or calendar event contents.

BEGIN;

CREATE TABLE IF NOT EXISTS "calendar_auto_tasks" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "ruleId" varchar(128) NOT NULL,
  "targetMonth" varchar(7) NOT NULL,
  "sourceEventId" varchar(512),
  "dateKey" varchar(10) NOT NULL,
  "category" varchar(128) NOT NULL,
  "label" varchar(512) NOT NULL,
  "defaultPlanned" varchar(64) DEFAULT '' NOT NULL,
  "status" varchar(32) DEFAULT 'scheduled' NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_auto_tasks_rule_month_unique"
  ON "calendar_auto_tasks" ("ruleId", "targetMonth");
CREATE INDEX IF NOT EXISTS "calendar_auto_tasks_date_status_idx"
  ON "calendar_auto_tasks" ("dateKey", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_calendar_auto_tasks_updated_at'
      AND tgrelid = 'calendar_auto_tasks'::regclass
  ) THEN
    CREATE TRIGGER "set_calendar_auto_tasks_updated_at"
      BEFORE UPDATE ON "calendar_auto_tasks"
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE "calendar_auto_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "calendar_auto_tasks" FROM anon, authenticated;

COMMIT;

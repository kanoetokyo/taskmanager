-- AtInn handover issue library. Additive only: no existing task or handover
-- records are changed or removed.

CREATE TABLE IF NOT EXISTS "atinn_handover_issues" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "title" varchar(255) DEFAULT '' NOT NULL,
  "content" varchar(2048) DEFAULT '' NOT NULL,
  "beforeImageUrl" varchar(2048),
  "afterImageUrl" varchar(2048),
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "deletedAt" timestamp,
  "updatedBy" varchar(64) DEFAULT '' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "atinn_handover_issues_active_order_idx"
  ON "atinn_handover_issues" ("sortOrder", "createdAt")
  WHERE "deletedAt" IS NULL;

DROP TRIGGER IF EXISTS "set_atinn_handover_issues_updated_at" ON "atinn_handover_issues";
CREATE TRIGGER "set_atinn_handover_issues_updated_at"
  BEFORE UPDATE ON "atinn_handover_issues"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE "atinn_handover_issues" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "atinn_handover_issues" FROM anon, authenticated;

-- Add a category to each AtInn handover issue. Existing issues remain uncategorized
-- until an operator selects one from the standard category list in the app.

ALTER TABLE "atinn_handover_issues"
  ADD COLUMN IF NOT EXISTS "category" varchar(64) DEFAULT '' NOT NULL;

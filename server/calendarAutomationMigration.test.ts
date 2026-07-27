import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../drizzle/migrations/0003_calendar_auto_tasks.sql",
  import.meta.url
);

describe("calendar automation migration", () => {
  it("is additive and retains generated-task history", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/^\s*--[\s\S]*?BEGIN;/);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "calendar_auto_tasks"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "calendar_auto_tasks_rule_month_unique"');
    expect(sql).toContain('ALTER TABLE "calendar_auto_tasks" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE "calendar_auto_tasks" FROM anon, authenticated');
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
  });
});

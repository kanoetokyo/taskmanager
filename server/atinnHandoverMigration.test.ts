import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../drizzle/migrations/0004_atinn_handover_issues.sql",
  import.meta.url
);

describe("AtInn handover migration", () => {
  it("creates an additive, protected issue library", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "atinn_handover_issues"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "atinn_handover_issues_active_order_idx"');
    expect(sql).toContain('ALTER TABLE "atinn_handover_issues" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE "atinn_handover_issues" FROM anon, authenticated');
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE/i);
  });
});

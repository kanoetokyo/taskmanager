import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../drizzle/migrations/0002_data_safety.sql", import.meta.url);

describe("data safety migration", () => {
  it("only adds recoverability controls and never drops application data", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "audit_logs"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "deletedAt"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "revision"');
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE/i);
  });

  it("prevents direct anon and authenticated writes to protected tables", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('ALTER TABLE "customer_handovers" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "individual_handovers" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE "task_states", "store_check_states", "individual_handovers", "customer_handovers", "audit_logs" FROM anon, authenticated');
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../drizzle/migrations/0004_customer_handover_attachments.sql",
  import.meta.url
);

describe("customer attachment migration", () => {
  it("adds protected attachment storage without changing existing cards", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "customer_handover_attachments"'
    );
    expect(sql).toContain('REFERENCES "customer_handovers"("id")');
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "customer_handover_attachments_customer_sort_unique"'
    );
    expect(sql).toContain(
      'ALTER TABLE "customer_handover_attachments" ENABLE ROW LEVEL SECURITY'
    );
    expect(sql).toContain(
      'REVOKE ALL ON TABLE "customer_handover_attachments" FROM anon, authenticated'
    );
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
  });
});

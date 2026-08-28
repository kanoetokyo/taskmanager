import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../drizzle/migrations/0005_atinn_handover_issue_categories.sql",
  import.meta.url
);

describe("AtInn handover issue category migration", () => {
  it("adds an optional category without removing existing issue data", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "category" varchar(64) DEFAULT \'\' NOT NULL');
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE/i);
  });
});

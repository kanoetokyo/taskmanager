import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("customer handover archive timestamps migration", () => {
  it("adds and backfills the cancellation timestamp without deleting records", async () => {
    const sql = await readFile(
      new URL(
        "../drizzle/migrations/0005_customer_handover_cancelled_at.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "cancelledAt" timestamp');
    expect(sql).toContain('SET "cancelledAt" = "updatedAt"');
    expect(sql).not.toMatch(/\bDELETE\b|\bDROP\b/i);
  });
});

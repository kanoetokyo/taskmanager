import { readFile } from "node:fs/promises";
import postgres from "postgres";

const BUILD_MIGRATIONS = [
  "drizzle/migrations/0004_customer_handover_attachments.sql",
  "drizzle/migrations/0005_customer_handover_cancelled_at.sql",
];

if (!process.env.VERCEL) {
  console.log("Skipping build migrations outside Vercel.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Vercel build migrations.");
}

const databaseUrl = new URL(process.env.DATABASE_URL);
if (process.env.DATABASE_PASSWORD) {
  databaseUrl.password = process.env.DATABASE_PASSWORD;
}

const client = postgres(databaseUrl.toString(), { max: 1, prepare: false });

try {
  for (const migrationPath of BUILD_MIGRATIONS) {
    const migration = await readFile(migrationPath, "utf8");
    await client.unsafe(migration);
    console.log(`Applied ${migrationPath}`);
  }
} finally {
  await client.end({ timeout: 5 });
}

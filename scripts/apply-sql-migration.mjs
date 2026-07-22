import { readFile } from "node:fs/promises";
import postgres from "postgres";

const [migrationPath] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

if (!migrationPath) {
  throw new Error("Pass the migration file path as the first argument.");
}

const migration = await readFile(migrationPath, "utf8");
const databaseUrl = new URL(process.env.DATABASE_URL);
if (process.env.DATABASE_PASSWORD) {
  databaseUrl.password = process.env.DATABASE_PASSWORD;
}
const client = postgres(databaseUrl.toString(), { max: 1, prepare: false });

try {
  await client.unsafe(migration);
  console.log(`Applied ${migrationPath}`);
} finally {
  await client.end({ timeout: 5 });
}

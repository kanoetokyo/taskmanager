import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";

const tables = [
  "task_states",
  "store_check_states",
  "individual_handovers",
  "customer_handovers",
];
const pageSize = 1_000;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

async function readAllRows(table) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`/rest/v1/${table}`, process.env.SUPABASE_URL);
    url.searchParams.set("select", "*");
    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) throw new Error(`Could not back up ${table}: ${response.status}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

const backup = {
  createdAt: new Date().toISOString(),
  source: "Supabase REST API",
  tables: Object.fromEntries(await Promise.all(tables.map(async table => [table, await readAllRows(table)]))),
};

const outputDir = path.resolve("task-kakumei-backups");
const timestamp = backup.createdAt.replace(/[:.]/g, "-");
const outputPath = path.join(outputDir, `task-kakumei-production-${timestamp}.json`);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(backup, null, 2), { encoding: "utf8", mode: 0o600 });
await chmod(outputPath, 0o600);

console.log(`Backup created: ${path.basename(outputPath)}`);
console.log(`Rows: ${tables.map(table => `${table}=${backup.tables[table].length}`).join(", ")}`);

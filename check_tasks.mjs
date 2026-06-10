import postgres from 'postgres';
import { config } from 'dotenv';
config();

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

// 2026-03-06のタスク状態を確認
const rows = await sql`
  SELECT "dateKey", "taskId", done, help
  FROM task_states
  WHERE "dateKey" = ${'2026-03-06'}
  ORDER BY "taskId"
`;
console.log('2026-03-06のタスク状態 (件数:', rows.length, ')');
const doneRows = rows.filter(r => r.done === 1 || r.done === true);
const undoneRows = rows.filter(r => r.done === 0 || r.done === false);
console.log('完了:', doneRows.length, '件');
console.log('未完了:', undoneRows.length, '件');
console.log('全タスクのdone値:');
rows.forEach(r => console.log(' ', r.taskId, ':', r.done, typeof r.done));

// 2026-03-07のタスク状態も確認
const rows2 = await sql`
  SELECT "dateKey", "taskId", done
  FROM task_states
  WHERE "dateKey" = ${'2026-03-07'}
  ORDER BY "taskId"
`;
console.log('\n2026-03-07のタスク状態 (件数:', rows2.length, ')');
const doneRows2 = rows2.filter(r => r.done === 1 || r.done === true);
console.log('完了:', doneRows2.length, '件');

await sql.end();

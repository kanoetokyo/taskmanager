import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 直近7日間のタスク状態を確認
const [rows] = await conn.execute(
  'SELECT dateKey, taskId, done FROM task_states ORDER BY dateKey DESC, taskId LIMIT 100'
);

// 日付ごとに集計
const byDate = {};
for (const r of rows) {
  if (!byDate[r.dateKey]) byDate[r.dateKey] = { done: 0, undone: 0 };
  if (r.done === 1 || r.done === true) byDate[r.dateKey].done++;
  else byDate[r.dateKey].undone++;
}

console.log('日付ごとのタスク完了状況:');
for (const [date, counts] of Object.entries(byDate)) {
  console.log(`  ${date}: 完了=${counts.done}, 未完了=${counts.undone}`);
}

// 完了タスクが存在する日付を探す
const [doneRows] = await conn.execute(
  'SELECT dateKey, COUNT(*) as cnt FROM task_states WHERE done = 1 GROUP BY dateKey ORDER BY dateKey DESC'
);
console.log('\n完了タスクが存在する日付:');
if (doneRows.length === 0) {
  console.log('  なし（DBに完了タスクが一切ない）');
} else {
  doneRows.forEach(r => console.log(`  ${r.dateKey}: ${r.cnt}件完了`));
}

await conn.end();

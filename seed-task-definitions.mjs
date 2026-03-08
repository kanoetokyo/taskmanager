/**
 * 初期データ投入スクリプト: BASE_TASKSをtask_categories・task_definitionsテーブルに移行
 * 実行: node seed-task-definitions.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// カテゴリ定義（表示順）
const CATEGORIES = [
  "各種システムのチェック",
  "顧客対応と事務作業",
  "決済確認",
  "LINEグループ管理",
  "アットイン清掃管理システム確認",
  "調整および書類作成",
  "大森TODO",
];

// タスク定義（BASE_TASKSと同内容）
const BASE_TASKS = [
  { category: "各種システムのチェック", label: "メールのチェック（osouji.oimachi@gmail.com）（ご近所割のスプシ確認）", defaultPlanned: "当日事務担当", deadline: "" },
  { category: "各種システムのチェック", label: "Storesの予約確認チェック", defaultPlanned: "当日事務担当", deadline: "" },

  { category: "顧客対応と事務作業", label: "電話対応（フリーダイヤル）および顧客対応（LINE・来店・メールなど）", defaultPlanned: "当日事務担当", deadline: "" },
  { category: "顧客対応と事務作業", label: "案件完了ごとの売上表更新・POSおよびラクーンの完了処理", defaultPlanned: "当日事務担当", deadline: "" },
  { category: "顧客対応と事務作業", label: "公式LINEからの前日リマインド送信", defaultPlanned: "当日事務担当", deadline: "" },
  { category: "顧客対応と事務作業", label: "公式LINEからのアフターフォローの実施", defaultPlanned: "当日事務担当", deadline: "" },

  { category: "決済確認", label: "SquareとPayPayの決済額とカレンダー内容が一致しているかの照合", defaultPlanned: "当日事務担当", deadline: "" },

  { category: "LINEグループ管理", label: "事務グループ（4グループのいずれか）への日付メッセージ投稿", defaultPlanned: "当日事務担当", deadline: "" },
  { category: "LINEグループ管理", label: "翌日の稼働グループの作成", defaultPlanned: "当日事務担当", deadline: "" },
  { category: "LINEグループ管理", label: "翌日のスケジュールと配車を確定させて配信する", defaultPlanned: "当日現場責任者", deadline: "17:00まで" },

  { category: "アットイン清掃管理システム確認", label: "翌日入居で清掃が漏れていないかの確認", defaultPlanned: "当日現場責任者", deadline: "12:00まで" },
  { category: "アットイン清掃管理システム確認", label: "赤くなっている清掃カードの消し込み作業（4/15まで確認する。4/15まではカレンダーへ入力、4/16以降は消し込みだけでOK）", defaultPlanned: "当日事務担当", deadline: "" },

  { category: "調整および書類作成", label: "STORESの空き枠のシフト調整（10日先まで確認すること）", defaultPlanned: "当日事務担当", deadline: "" },
  { category: "調整および書類作成", label: "翌日の見積もり作成および印刷", defaultPlanned: "当日事務担当", deadline: "" },

  { category: "大森TODO", label: "前日の売上日報の確認", defaultPlanned: "当日現場責任者", deadline: "" },
  { category: "大森TODO", label: "前日のインセンティブ報告の内容確認", defaultPlanned: "当日現場責任者", deadline: "" },
  { category: "大森TODO", label: "1週間先までのグレーセルの確認", defaultPlanned: "当日現場責任者", deadline: "" },
  { category: "大森TODO", label: "現金確認", defaultPlanned: "当日現場責任者", deadline: "" },
  { category: "大森TODO", label: "アットインスラックの返信もれ確認", defaultPlanned: "当日現場責任者", deadline: "17:00まで" },
  { category: "大森TODO", label: "タイミー手配・修正依頼確認", defaultPlanned: "当日現場責任者", deadline: "" },
  { category: "大森TODO", label: "アットイン・富士通の鍵確認（曜日トレーに入れる）", defaultPlanned: "当日現場責任者", deadline: "" },
  { category: "大森TODO", label: "アットイン管理表と完了分の付け合わせ", defaultPlanned: "当日現場責任者", deadline: "" },
];

// 既存データ確認
const [existingCats] = await conn.execute("SELECT COUNT(*) as cnt FROM task_categories");
if (existingCats[0].cnt > 0) {
  console.log("task_categoriesにすでにデータがあります。スキップします。");
  await conn.end();
  process.exit(0);
}

// カテゴリ投入
const categoryIdMap = {};
for (let i = 0; i < CATEGORIES.length; i++) {
  const [result] = await conn.execute(
    "INSERT INTO task_categories (name, sortOrder, isActive) VALUES (?, ?, 1)",
    [CATEGORIES[i], i]
  );
  categoryIdMap[CATEGORIES[i]] = result.insertId;
  console.log(`カテゴリ追加: ${CATEGORIES[i]} (id=${result.insertId})`);
}

// タスク定義投入
const taskCountByCategory = {};
for (const task of BASE_TASKS) {
  const catId = categoryIdMap[task.category];
  if (!catId) {
    console.warn(`カテゴリが見つかりません: ${task.category}`);
    continue;
  }
  const sortOrder = taskCountByCategory[task.category] ?? 0;
  taskCountByCategory[task.category] = sortOrder + 1;

  await conn.execute(
    "INSERT INTO task_definitions (categoryId, label, defaultPlanned, deadline, sortOrder, isActive) VALUES (?, ?, ?, ?, ?, 1)",
    [catId, task.label, task.defaultPlanned, task.deadline, sortOrder]
  );
  console.log(`タスク追加: [${task.category}] ${task.label}`);
}

await conn.end();
console.log("\n✅ 初期データ投入完了");

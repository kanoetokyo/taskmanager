/**
 * タスク管理アプリ - メインページ
 * Design: Structured Utility
 * - テーブル形式でタスクを一覧表示
 * - カテゴリごとに薄いカラーコーディング
 * - 作業予定者・実施者のプルダウン
 * - 完了チェックボックス（完了行はグレーアウト＋取り消し線）
 * - localStorageで状態保持
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";

const MEMBERS = ["", "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "その他"];

interface Task {
  id: string;
  category: string;
  label: string;
  planned: string;
  actual: string;
  done: boolean;
}

const INITIAL_TASKS: Task[] = [
  // 各種システムのチェック
  { id: "sys-a-1", category: "各種システムのチェック", label: "(a) 公式LINEのチェック（大井町店）", planned: "", actual: "", done: false },
  { id: "sys-a-2", category: "各種システムのチェック", label: "(a) 公式LINEのチェック（大森南店）", planned: "", actual: "", done: false },
  { id: "sys-a-3", category: "各種システムのチェック", label: "(a) 公式LINEのチェック（天満店）", planned: "", actual: "", done: false },
  { id: "sys-a-4", category: "各種システムのチェック", label: "(a) 公式LINEのチェック（戸越銀座駅前店）", planned: "", actual: "", done: false },
  { id: "sys-a-5", category: "各種システムのチェック", label: "(a) 公式LINEのチェック（大田中央店）", planned: "", actual: "", done: false },
  { id: "sys-a-6", category: "各種システムのチェック", label: "(a) 公式LINEのチェック（川崎新町店）", planned: "", actual: "", done: false },
  { id: "sys-a-7", category: "各種システムのチェック", label: "(a) 公式LINEのチェック（幸塚越店）", planned: "", actual: "", done: false },
  { id: "sys-b-1", category: "各種システムのチェック", label: "(b) POSのチェック（大井町店）", planned: "", actual: "", done: false },
  { id: "sys-b-2", category: "各種システムのチェック", label: "(b) POSのチェック（大森南店）", planned: "", actual: "", done: false },
  { id: "sys-b-3", category: "各種システムのチェック", label: "(b) POSのチェック（天満店）", planned: "", actual: "", done: false },
  { id: "sys-b-4", category: "各種システムのチェック", label: "(b) POSのチェック（戸越銀座駅前店）", planned: "", actual: "", done: false },
  { id: "sys-b-5", category: "各種システムのチェック", label: "(b) POSのチェック（大田中央店）", planned: "", actual: "", done: false },
  { id: "sys-b-6", category: "各種システムのチェック", label: "(b) POSのチェック（川崎新町店）", planned: "", actual: "", done: false },
  { id: "sys-b-7", category: "各種システムのチェック", label: "(b) POSのチェック（幸塚越店）", planned: "", actual: "", done: false },
  { id: "sys-c-1", category: "各種システムのチェック", label: "(c) ラクーンのチェック（大井町店）", planned: "", actual: "", done: false },
  { id: "sys-c-2", category: "各種システムのチェック", label: "(c) ラクーンのチェック（大森南店）", planned: "", actual: "", done: false },
  { id: "sys-c-3", category: "各種システムのチェック", label: "(c) ラクーンのチェック（天満店）", planned: "", actual: "", done: false },
  { id: "sys-c-4", category: "各種システムのチェック", label: "(c) ラクーンのチェック（戸越銀座駅前店）", planned: "", actual: "", done: false },
  { id: "sys-c-5", category: "各種システムのチェック", label: "(c) ラクーンのチェック（大田中央店）", planned: "", actual: "", done: false },
  { id: "sys-c-6", category: "各種システムのチェック", label: "(c) ラクーンのチェック（川崎新町店）", planned: "", actual: "", done: false },
  { id: "sys-c-7", category: "各種システムのチェック", label: "(c) ラクーンのチェック（幸塚越店）", planned: "", actual: "", done: false },
  { id: "sys-d-1", category: "各種システムのチェック", label: "(d) メールのチェック（osouji.oimachi@gmail.com）", planned: "", actual: "", done: false },
  { id: "sys-e-1", category: "各種システムのチェック", label: "(e) Storesの予約確認チェック", planned: "", actual: "", done: false },

  // 顧客対応と事務作業
  { id: "cust-a", category: "顧客対応と事務作業", label: "(a) 電話対応（フリーダイヤル）および顧客対応（LINE・来店・メールなど）", planned: "", actual: "", done: false },
  { id: "cust-b", category: "顧客対応と事務作業", label: "(b) 案件完了ごとの売上表更新・POSおよびラクーンの完了処理", planned: "", actual: "", done: false },
  { id: "cust-c", category: "顧客対応と事務作業", label: "(c) 公式LINEからの前日リマインド送信", planned: "", actual: "", done: false },
  { id: "cust-d", category: "顧客対応と事務作業", label: "(d) 公式LINEからのアフターフォローの実施", planned: "", actual: "", done: false },

  // 決済確認
  { id: "pay-a", category: "決済確認", label: "(a) SquareとPayPayの決済額とカレンダー内容が一致しているかの照合", planned: "", actual: "", done: false },

  // LINEグループ管理
  { id: "line-a", category: "LINEグループ管理", label: "(a) 事務グループ（4グループのいずれか）への日付メッセージ投稿", planned: "", actual: "", done: false },
  { id: "line-b", category: "LINEグループ管理", label: "(b) 翌日の稼働グループの作成", planned: "", actual: "", done: false },
  { id: "line-c", category: "LINEグループ管理", label: "(c) 翌日のスケジュールと配車を確定させて配信する", planned: "", actual: "", done: false },

  // 清掃管理
  { id: "clean-a", category: "清掃管理（前田君または担当者）", label: "(a) 清掃管理システム「アットイン」の緊急案件の確認（4月10日までの赤カードがないか）", planned: "", actual: "", done: false },
  { id: "clean-b", category: "清掃管理（前田君または担当者）", label: "(b) 赤くなっている清掃カードの消し込み作業", planned: "", actual: "", done: false },

  // 調整および書類作成
  { id: "doc-a", category: "調整および書類作成", label: "(a) Storesの空き枠のシフト調整", planned: "", actual: "", done: false },
  { id: "doc-b", category: "調整および書類作成", label: "(b) 翌日の見積もりの作成および印刷", planned: "", actual: "", done: false },
];

const CATEGORY_COLORS: Record<string, string> = {
  "各種システムのチェック": "bg-blue-50",
  "顧客対応と事務作業": "bg-green-50",
  "決済確認": "bg-yellow-50",
  "LINEグループ管理": "bg-cyan-50",
  "清掃管理（前田君または担当者）": "bg-orange-50",
  "調整および書類作成": "bg-purple-50",
};

const CATEGORY_HEADER_COLORS: Record<string, string> = {
  "各種システムのチェック": "bg-blue-100 border-blue-300 text-blue-800",
  "顧客対応と事務作業": "bg-green-100 border-green-300 text-green-800",
  "決済確認": "bg-yellow-100 border-yellow-300 text-yellow-800",
  "LINEグループ管理": "bg-cyan-100 border-cyan-300 text-cyan-800",
  "清掃管理（前田君または担当者）": "bg-orange-100 border-orange-300 text-orange-800",
  "調整および書類作成": "bg-purple-100 border-purple-300 text-purple-800",
};

const STORAGE_KEY = "task-manager-data";

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${["日","月","火","水","木","金","土"][d.getDay()]}）`;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Task[];
        return INITIAL_TASKS.map(t => {
          const found = parsed.find(p => p.id === t.id);
          return found ? { ...t, planned: found.planned, actual: found.actual, done: found.done ?? false } : t;
        });
      }
    } catch {}
    return INITIAL_TASKS;
  });

  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const updateTask = (id: string, field: "planned" | "actual", value: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const toggleDone = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    const now = new Date();
    setLastSaved(`${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")} 保存済み`);
    toast.success("保存しました");
  };

  const handleReset = () => {
    if (!confirm("全ての担当者設定と完了状態をリセットしますか？")) return;
    const reset = INITIAL_TASKS.map(t => ({ ...t, planned: "", actual: "", done: false }));
    setTasks(reset);
    localStorage.removeItem(STORAGE_KEY);
    setLastSaved(null);
    toast.info("リセットしました");
  };

  // Auto-save on change
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }, 500);
    return () => clearTimeout(timer);
  }, [tasks]);

  // Progress stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.done).length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const categories = Array.from(new Set(INITIAL_TASKS.map(t => t.category)));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-700 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-wide">タスク管理</h1>
            <p className="text-slate-300 text-xs mt-0.5">{getTodayString()}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastSaved && (
              <span className="text-slate-300 text-xs hidden sm:inline">{lastSaved}</span>
            )}
            <button
              onClick={handleReset}
              className="text-xs px-3 py-1.5 rounded border border-slate-400 text-slate-200 hover:bg-slate-600 transition-colors"
            >
              リセット
            </button>
            <button
              onClick={handleSave}
              className="text-xs px-4 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors"
            >
              保存
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-600 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? "#22c55e" : "#38bdf8",
                }}
              />
            </div>
            <span className="text-xs text-slate-300 whitespace-nowrap">
              {doneTasks} / {totalTasks} 完了 ({progressPct}%)
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {categories.map(cat => {
          const catTasks = tasks.filter(t => t.category === cat);
          const catDone = catTasks.filter(t => t.done).length;
          const headerColor = CATEGORY_HEADER_COLORS[cat] || "bg-gray-100 border-gray-300 text-gray-800";
          const rowColor = CATEGORY_COLORS[cat] || "bg-white";

          return (
            <section key={cat} className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
              {/* Category header */}
              <div className={`px-4 py-2.5 border-b flex items-center justify-between font-semibold text-sm ${headerColor}`}>
                <span>{cat}</span>
                <span className="text-xs font-normal opacity-70">
                  {catDone}/{catTasks.length}
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-14 whitespace-nowrap">完了</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 w-auto">タスク</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-36 whitespace-nowrap">作業予定者</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-36 whitespace-nowrap">実施者</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catTasks.map((task) => (
                      <tr
                        key={task.id}
                        className={`border-b border-gray-100 last:border-0 transition-all duration-200 ${
                          task.done
                            ? "bg-gray-100 opacity-60"
                            : `${rowColor} hover:brightness-95`
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() => toggleDone(task.id)}
                            className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                          />
                        </td>

                        {/* Task label */}
                        <td className={`px-4 py-2.5 leading-snug transition-all duration-200 ${
                          task.done ? "text-gray-400 line-through" : "text-gray-700"
                        }`}>
                          {task.done && (
                            <span className="inline-block mr-2 text-green-500 font-bold text-xs">✓</span>
                          )}
                          {task.label}
                        </td>

                        {/* Planned */}
                        <td className="px-3 py-2 text-center">
                          <select
                            value={task.planned}
                            onChange={e => updateTask(task.id, "planned", e.target.value)}
                            disabled={task.done}
                            className={`w-full rounded border text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors ${
                              task.done
                                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "border-gray-300 bg-white text-gray-700"
                            }`}
                          >
                            {MEMBERS.map(m => (
                              <option key={m} value={m}>{m === "" ? "-- 未設定 --" : m}</option>
                            ))}
                          </select>
                        </td>

                        {/* Actual */}
                        <td className="px-3 py-2 text-center">
                          <select
                            value={task.actual}
                            onChange={e => updateTask(task.id, "actual", e.target.value)}
                            disabled={task.done}
                            className={`w-full rounded border text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors ${
                              task.done
                                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "border-gray-300 bg-white text-gray-700"
                            }`}
                          >
                            {MEMBERS.map(m => (
                              <option key={m} value={m}>{m === "" ? "-- 未設定 --" : m}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 pb-4">
          入力内容はブラウザに自動保存されます。「保存」ボタンで明示的に保存することもできます。
        </p>
      </main>
    </div>
  );
}

/**
 * タスク管理アプリ - メインページ
 * Design: Structured Utility
 * - テーブル形式でタスクを一覧表示
 * - カテゴリごとに薄いカラーコーディング
 * - 作業予定者（デフォルト：当日事務担当）・実施者のプルダウン
 * - 完了チェックボックス（完了行はグレーアウト＋取り消し線）
 * - 前日・翌日ナビゲーション（日付ごとにlocalStorageで状態保持）
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PLANNED_MEMBERS = ["当日事務担当", "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "その他"];
const ACTUAL_MEMBERS = ["", "当日事務担当", "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "その他"];

interface Task {
  id: string;
  category: string;
  label: string;
  planned: string;
  actual: string;
  done: boolean;
}

const BASE_TASKS: Omit<Task, "planned" | "actual" | "done">[] = [
  // 各種システムのチェック
  { id: "sys-a-1", category: "各種システムのチェック", label: "公式LINEのチェック（大井町店）" },
  { id: "sys-a-2", category: "各種システムのチェック", label: "公式LINEのチェック（大森南店）" },
  { id: "sys-a-3", category: "各種システムのチェック", label: "公式LINEのチェック（天満店）" },
  { id: "sys-a-4", category: "各種システムのチェック", label: "公式LINEのチェック（戸越銀座駅前店）" },
  { id: "sys-a-5", category: "各種システムのチェック", label: "公式LINEのチェック（大田中央店）" },
  { id: "sys-a-6", category: "各種システムのチェック", label: "公式LINEのチェック（川崎新町店）" },
  { id: "sys-a-7", category: "各種システムのチェック", label: "公式LINEのチェック（幸塚越店）" },
  { id: "sys-b-1", category: "各種システムのチェック", label: "POSのチェック（大井町店）" },
  { id: "sys-b-2", category: "各種システムのチェック", label: "POSのチェック（大森南店）" },
  { id: "sys-b-3", category: "各種システムのチェック", label: "POSのチェック（天満店）" },
  { id: "sys-b-4", category: "各種システムのチェック", label: "POSのチェック（戸越銀座駅前店）" },
  { id: "sys-b-5", category: "各種システムのチェック", label: "POSのチェック（大田中央店）" },
  { id: "sys-b-6", category: "各種システムのチェック", label: "POSのチェック（川崎新町店）" },
  { id: "sys-b-7", category: "各種システムのチェック", label: "POSのチェック（幸塚越店）" },
  { id: "sys-c-1", category: "各種システムのチェック", label: "ラクーンのチェック（大井町店）" },
  { id: "sys-c-2", category: "各種システムのチェック", label: "ラクーンのチェック（大森南店）" },
  { id: "sys-c-3", category: "各種システムのチェック", label: "ラクーンのチェック（天満店）" },
  { id: "sys-c-4", category: "各種システムのチェック", label: "ラクーンのチェック（戸越銀座駅前店）" },
  { id: "sys-c-5", category: "各種システムのチェック", label: "ラクーンのチェック（大田中央店）" },
  { id: "sys-c-6", category: "各種システムのチェック", label: "ラクーンのチェック（川崎新町店）" },
  { id: "sys-c-7", category: "各種システムのチェック", label: "ラクーンのチェック（幸塚越店）" },
  { id: "sys-d-1", category: "各種システムのチェック", label: "メールのチェック（osouji.oimachi@gmail.com）" },
  { id: "sys-e-1", category: "各種システムのチェック", label: "Storesの予約確認チェック" },

  // 顧客対応と事務作業
  { id: "cust-a", category: "顧客対応と事務作業", label: "電話対応（フリーダイヤル）および顧客対応（LINE・来店・メールなど）" },
  { id: "cust-b", category: "顧客対応と事務作業", label: "案件完了ごとの売上表更新・POSおよびラクーンの完了処理" },
  { id: "cust-c", category: "顧客対応と事務作業", label: "公式LINEからの前日リマインド送信" },
  { id: "cust-d", category: "顧客対応と事務作業", label: "公式LINEからのアフターフォローの実施" },

  // 決済確認
  { id: "pay-a", category: "決済確認", label: "SquareとPayPayの決済額とカレンダー内容が一致しているかの照合" },

  // LINEグループ管理
  { id: "line-a", category: "LINEグループ管理", label: "事務グループ（4グループのいずれか）への日付メッセージ投稿" },
  { id: "line-b", category: "LINEグループ管理", label: "翌日の稼働グループの作成" },
  { id: "line-c", category: "LINEグループ管理", label: "翌日のスケジュールと配車を確定させて配信する" },

  // 清掃管理
  { id: "clean-a", category: "清掃管理（前田君または担当者）", label: "清掃管理システム「アットイン」の緊急案件の確認（4月10日までの赤カードがないか）" },
  { id: "clean-b", category: "清掃管理（前田君または担当者）", label: "赤くなっている清掃カードの消し込み作業" },

  // 調整および書類作成
  { id: "doc-a", category: "調整および書類作成", label: "Storesの空き枠のシフト調整" },
  { id: "doc-b", category: "調整および書類作成", label: "翌日の見積もりの作成および印刷" },
];

function makeInitialTasks(): Task[] {
  return BASE_TASKS.map(t => ({ ...t, planned: "当日事務担当", actual: "", done: false }));
}

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

// Date utilities
function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayKey(): string {
  return dateToKey(new Date());
}

function formatDateLabel(key: string): string {
  const d = keyToDate(key);
  const today = todayKey();
  const yesterday = dateToKey(new Date(Date.now() - 86400000));
  const tomorrow = dateToKey(new Date(Date.now() + 86400000));
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const base = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${dayNames[d.getDay()]}）`;
  if (key === today) return `${base} ─ 今日`;
  if (key === yesterday) return `${base} ─ 昨日`;
  if (key === tomorrow) return `${base} ─ 明日`;
  return base;
}

function storageKey(dateKey: string): string {
  return `task-manager-${dateKey}`;
}

function loadTasks(dateKey: string): Task[] {
  try {
    const saved = localStorage.getItem(storageKey(dateKey));
    if (saved) {
      const parsed = JSON.parse(saved) as Task[];
      return BASE_TASKS.map(t => {
        const found = parsed.find(p => p.id === t.id);
        return found
          ? { ...t, planned: found.planned ?? "当日事務担当", actual: found.actual ?? "", done: found.done ?? false }
          : { ...t, planned: "当日事務担当", actual: "", done: false };
      });
    }
  } catch {}
  return makeInitialTasks();
}

function saveTasks(dateKey: string, tasks: Task[]) {
  localStorage.setItem(storageKey(dateKey), JSON.stringify(tasks));
}

export default function Home() {
  const [currentDateKey, setCurrentDateKey] = useState<string>(todayKey);
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(todayKey()));
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Load tasks when date changes
  useEffect(() => {
    setTasks(loadTasks(currentDateKey));
    setLastSaved(null);
  }, [currentDateKey]);

  // Auto-save on change
  useEffect(() => {
    const timer = setTimeout(() => {
      saveTasks(currentDateKey, tasks);
    }, 500);
    return () => clearTimeout(timer);
  }, [tasks, currentDateKey]);

  const goToPrevDay = useCallback(() => {
    const d = keyToDate(currentDateKey);
    d.setDate(d.getDate() - 1);
    setCurrentDateKey(dateToKey(d));
  }, [currentDateKey]);

  const goToNextDay = useCallback(() => {
    const d = keyToDate(currentDateKey);
    d.setDate(d.getDate() + 1);
    setCurrentDateKey(dateToKey(d));
  }, [currentDateKey]);

  const goToToday = useCallback(() => {
    setCurrentDateKey(todayKey());
  }, []);

  const updateTask = (id: string, field: "planned" | "actual", value: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const toggleDone = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const handleSave = () => {
    saveTasks(currentDateKey, tasks);
    const now = new Date();
    setLastSaved(`${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")} 保存済み`);
    toast.success("保存しました");
  };

  const handleReset = () => {
    if (!confirm("この日の全設定をリセットしますか？")) return;
    const reset = makeInitialTasks();
    setTasks(reset);
    localStorage.removeItem(storageKey(currentDateKey));
    setLastSaved(null);
    toast.info("リセットしました");
  };

  const isToday = currentDateKey === todayKey();

  // Progress
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.done).length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const categories = Array.from(new Set(BASE_TASKS.map(t => t.category)));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-700 text-white shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2 flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold tracking-wide shrink-0">タスク管理</h1>

          {/* Date navigation */}
          <div className="flex items-center gap-1 flex-1 justify-center">
            <button
              onClick={goToPrevDay}
              className="p-1.5 rounded hover:bg-slate-600 transition-colors"
              title="前日"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{formatDateLabel(currentDateKey)}</p>
            </div>
            <button
              onClick={goToNextDay}
              className="p-1.5 rounded hover:bg-slate-600 transition-colors"
              title="翌日"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-xs px-2.5 py-1.5 rounded bg-slate-500 hover:bg-slate-400 text-white transition-colors"
              >
                今日
              </button>
            )}
            {lastSaved && (
              <span className="text-slate-300 text-xs hidden md:inline">{lastSaved}</span>
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
                <span className="text-xs font-normal opacity-70">{catDone}/{catTasks.length}</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-14 whitespace-nowrap">完了</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 w-auto">タスク</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-40 whitespace-nowrap">作業予定者</th>
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
                            <span className="inline-block mr-1.5 text-green-500 font-bold text-xs">✓</span>
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
                                : task.planned === "当日事務担当"
                                  ? "border-sky-300 bg-sky-50 text-sky-700 font-medium"
                                  : "border-gray-300 bg-white text-gray-700"
                            }`}
                          >
                            {PLANNED_MEMBERS.map(m => (
                              <option key={m} value={m}>{m}</option>
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
                            {ACTUAL_MEMBERS.map(m => (
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

        <p className="text-center text-xs text-gray-400 pb-4">
          入力内容はブラウザに自動保存されます。日付ごとにデータが保存されます。
        </p>
      </main>
    </div>
  );
}

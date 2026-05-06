/**
 * 表示日制限タスク一覧・設定ページ
 * - showOnDaysが設定されているタスクを一覧表示
 * - 各タスクのshowOnDays・deadlineをインライン編集可能
 * - 今日の日付でプレビュー確認（表示される/されない）
 * - カテゴリ別グループ表示
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Edit2,
  Check,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── 型定義 ────────────────────────────────────────────────────────────────────

interface TaskDefRow {
  id: number;
  label: string;
  showOnDays: string;
  deadline: string;
  defaultPlanned: string;
  categoryId: number;
  sortOrder: number;
}

interface CategoryRow {
  id: number;
  name: string;
  tasks: TaskDefRow[];
}

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

/** showOnDays文字列を日付番号の配列に変換 */
function parseShowOnDays(s: string): number[] {
  if (!s || s.trim() === "") return [];
  return s.split(",").map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 31);
}

/** 日付番号の配列を表示用文字列に変換 */
function formatDayRange(days: number[]): string {
  if (days.length === 0) return "毎日";
  const sorted = [...days].sort((a, b) => a - b);
  // 連続する範囲をまとめる
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}日` : `${start}〜${end}日`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}日` : `${start}〜${end}日`);
  return "毎月 " + ranges.join("・");
}

/** 今日の日付でタスクが表示されるか判定 */
function isVisibleToday(showOnDays: string): boolean {
  const days = parseShowOnDays(showOnDays);
  if (days.length === 0) return true; // 制限なし = 毎日
  const today = new Date().getDate();
  const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const effective = days.map(d => d > lastDay ? lastDay : d);
  return effective.includes(today);
}

/** 今日が期限を超えているか判定（showOnDaysの最大値を期限日とする） */
function isOverdueToday(showOnDays: string): boolean {
  const days = parseShowOnDays(showOnDays);
  if (days.length === 0) return false;
  const today = new Date().getDate();
  const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const effective = days.map(d => d > lastDay ? lastDay : d);
  const maxDay = Math.max(...effective);
  return today > maxDay;
}

// ─── 月カレンダープレビュー ───────────────────────────────────────────────────

function MonthPreview({ showOnDays }: { showOnDays: string }) {
  const days = parseShowOnDays(showOnDays);
  const today = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const effective = days.map(d => d > daysInMonth ? daysInMonth : d);

  return (
    <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
      <p className="text-[10px] text-gray-400 font-medium mb-1.5">今月の表示日プレビュー</p>
      <div className="flex flex-wrap gap-0.5">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
          const isActive = effective.length === 0 || effective.includes(d);
          const isToday = d === today;
          return (
            <span
              key={d}
              className={`inline-flex items-center justify-center w-6 h-6 text-[10px] rounded font-medium transition-colors ${
                isToday
                  ? isActive
                    ? "bg-blue-500 text-white ring-2 ring-blue-300"
                    : "bg-gray-200 text-gray-400 ring-2 ring-gray-300"
                  : isActive
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-300"
              }`}
            >
              {d}
            </span>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">
        <span className="inline-block w-3 h-3 bg-blue-100 rounded mr-1 align-middle" />表示日
        <span className="inline-block w-3 h-3 bg-gray-100 rounded mx-1 ml-2 align-middle" />非表示日
        <span className="inline-block w-3 h-3 bg-blue-500 rounded mx-1 ml-2 align-middle" />今日
      </p>
    </div>
  );
}

// ─── タスク行コンポーネント ────────────────────────────────────────────────────

interface TaskState {
  taskId: string;
  done: boolean;
  help: boolean;
  note: string;
  completedDateKey?: string;
  completedBy?: string;
}

const PLANNED_MEMBERS = ["当日事務担当", "当日現場責任者", "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "四藤", "ウララ", "森山", "勅使河原", "その他"];

interface TaskRowProps {
  task: TaskDefRow;
  taskState?: TaskState;
  todayDateKey: string;
  onSave: (id: number, showOnDays: string, deadline: string) => void;
  onSaveCompletedDate: (taskId: string, dateKey: string) => void;
}

function TaskRow({ task, taskState, todayDateKey, onSave, onSaveCompletedDate }: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [showOnDaysInput, setShowOnDaysInput] = useState(task.showOnDays ?? "");
  const [deadlineInput, setDeadlineInput] = useState(task.deadline ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const visible = isVisibleToday(task.showOnDays ?? "");
  const overdue = isOverdueToday(task.showOnDays ?? "") && !taskState?.done; // 完了済みは期限超過扱いにしない
  const hasLimit = (task.showOnDays ?? "").trim() !== "";

  const handleSave = () => {
    onSave(task.id, showOnDaysInput, deadlineInput);
    setEditing(false);
  };

  const handleCancel = () => {
    setShowOnDaysInput(task.showOnDays ?? "");
    setDeadlineInput(task.deadline ?? "");
    setEditing(false);
  };

  return (
    <div className={`border rounded-lg p-3 transition-all ${
      overdue && !visible
        ? "border-red-200 bg-red-50"
        : visible && hasLimit
          ? "border-blue-200 bg-blue-50"
          : hasLimit
            ? "border-gray-200 bg-white"
            : "border-gray-100 bg-gray-50"
    }`}>
      {/* タスク名 + 状態バッジ */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${
            overdue && !visible ? "text-red-700" : "text-gray-800"
          }`}>
            {task.label}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* 完了状態バッジ（showOnDays設定があるタスクのみ表示） */}
          {taskState?.done && hasLimit ? (() => {
            // completedDateKeyがあればその日付、なければpropsのtodayDateKeyを使用
            const dateKey = taskState.completedDateKey ?? todayDateKey;
            const [, m, d] = dateKey.split("-");
            return (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDatePicker(p => !p);
                }}
                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 transition-colors cursor-pointer"
                title="完了日を変更（クリックで編集）"
              >
                <Check className="w-2.5 h-2.5" />
                {parseInt(m)}月{parseInt(d)}日完了
              </button>
            );
          })() : taskState !== undefined ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">
              未完了
            </span>
          ) : null}
          {/* 今日の表示状態バッジ */}
          {hasLimit ? (
            visible ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white">
                <Eye className="w-2.5 h-2.5" />
                今日表示中
              </span>
            ) : overdue ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                <AlertTriangle className="w-2.5 h-2.5" />
                期限超過
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-300 text-gray-600">
                <EyeOff className="w-2.5 h-2.5" />
                今日は非表示
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
              毎日表示
            </span>
          )}
          {/* 編集ボタン */}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              title="編集"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 現在の設定値（表示モード） */}
      {!editing && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 text-gray-600">
            <Calendar className="w-3 h-3 text-blue-400" />
            {formatDayRange(parseShowOnDays(task.showOnDays ?? ""))}
          </span>
          {task.deadline && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              {task.deadline}
            </span>
          )}
          {hasLimit && (
            <button
              onClick={() => setShowPreview(p => !p)}
              className="flex items-center gap-1 text-blue-500 hover:text-blue-700 transition-colors ml-auto"
            >
              <CalendarDays className="w-3 h-3" />
              {showPreview ? "プレビューを閉じる" : "月カレンダーで確認"}
            </button>
          )}
        </div>
      )}

      {/* カレンダープレビュー */}
      {!editing && showPreview && hasLimit && (
        <MonthPreview showOnDays={task.showOnDays ?? ""} />
      )}

      {/* 完了日変更ピッカー（インライン表示） */}
      {showDatePicker && taskState?.done && (
        <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
          <p className="text-[11px] text-green-700 font-medium mb-1.5">完了日を変更</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              defaultValue={taskState.completedDateKey ?? todayDateKey}
              max={todayDateKey}
              onChange={e => {
                if (e.target.value) {
                  onSaveCompletedDate(`def-${task.id}`, e.target.value);
                  setShowDatePicker(false);
                }
              }}
              className="text-xs border border-green-300 rounded px-2 py-1 focus:outline-none focus:border-green-500 bg-white"
            />
            <button
              onClick={() => setShowDatePicker(false)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 編集フォーム */}
      {editing && (
        <div className="space-y-2 mt-1">
          <div>
            <label className="text-[11px] text-gray-500 font-medium block mb-0.5">
              表示日（カンマ区切りで日付番号を入力）
            </label>
            <input
              type="text"
              value={showOnDaysInput}
              onChange={e => setShowOnDaysInput(e.target.value)}
              placeholder="例: 1,2,3,4,5 または 15,16,17,18,19,20 （空欄=毎日）"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            />
            {showOnDaysInput.trim() !== "" && (
              <p className="text-[10px] text-blue-600 mt-0.5">
                → {formatDayRange(parseShowOnDays(showOnDaysInput))}
              </p>
            )}
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium block mb-0.5">
              期限ラベル（表示用テキスト）
            </label>
            <input
              type="text"
              value={deadlineInput}
              onChange={e => setDeadlineInput(e.target.value)}
              placeholder="例: 毎月5日まで"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            />
          </div>
          {showOnDaysInput.trim() !== "" && (
            <MonthPreview showOnDays={showOnDaysInput} />
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              保存
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              キャンセル
            </button>
            {showOnDaysInput.trim() !== "" && (
              <button
                onClick={() => setShowOnDaysInput("")}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors ml-auto"
                title="表示日制限を解除して毎日表示に戻す"
              >
                <Trash2 className="w-3.5 h-3.5" />
                制限を解除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── メインコンポーネント ──────────────────────────────────────────────────────

export default function ShowOnDaysPage() {
  const [lastSaved, setLastSaved] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "limited">("limited");

  // タブタイトルを設定
  useEffect(() => {
    const prev = document.title;
    document.title = "ルーティン一覧";
    return () => { document.title = prev; };
  }, []);

  // 今日の日付キー（YYYY-MM-DD）
  const todayDateKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { data: taskDefinitionData, refetch } = trpc.taskDefinition.getAll.useQuery(
    undefined,
    { staleTime: 0 }
  );

  // 今日のタスク完了状態を取得（当月完了日・完了者も取得）
  const { data: todayTaskStates } = trpc.task.taskStates.getByDateWithMonthly.useQuery(
    { dateKey: todayDateKey },
    { refetchInterval: 30000 }
  );

  // taskId → TaskState のマップ
  const taskStateMap = useMemo(() => {
    const map = new Map<string, TaskState>();
    (todayTaskStates ?? []).forEach((s: any) => {
      // noteから__completedDate・__completedByタグを抽出
      const rawNote: string = s.note ?? "";
      const completedDateMatch = rawNote.match(/__completedDate:(\d{4}-\d{2}-\d{2})/);
      const completedByMatch = rawNote.match(/__completedBy:([^\n]+)/);
      map.set(String(s.taskId), {
        taskId: String(s.taskId),
        done: !!s.done,
        help: !!s.help,
        note: rawNote.replace(/\n?__completedDate:\d{4}-\d{2}-\d{2}/g, "").replace(/\n?__completedBy:[^\n]+/g, "").trim(),
        completedDateKey: completedDateMatch ? completedDateMatch[1] : undefined,
        completedBy: completedByMatch ? completedByMatch[1].trim() : undefined,
      });
    });
    return map;
  }, [todayTaskStates]);

  const updateTask = trpc.taskDefinition.updateTask.useMutation({
    onSuccess: () => {
      const now = new Date();
      setLastSaved(`保存済み ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      refetch();
    },
    onError: () => {
      toast.error("保存に失敗しました。");
    },
  });

  const handleSave = useCallback((id: number, showOnDays: string, deadline: string) => {
    updateTask.mutate({ id, showOnDays, deadline });
    toast.success("設定を保存しました。");
  }, [updateTask]);

  // 完了者を記録する mutation
  const upsertTaskState = trpc.task.taskStates.upsert.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("完了者を記録しました。");
    },
    onError: () => {
      toast.error("保存に失敗しました。");
    },
  });

  const handleSaveCompletedDate = useCallback((taskId: string, newDateKey: string) => {
    const state = taskStateMap.get(taskId);
    if (!state) return;
    // noteに__completedDateタグを更新して保存
    const cleanNote = state.note;
    const newNote = `${cleanNote}\n__completedDate:${newDateKey}`.trim();
    upsertTaskState.mutate({
      dateKey: todayDateKey,
      taskId,
      done: true,
      help: state.help,
      note: newNote,
    });
  }, [taskStateMap, todayDateKey, upsertTaskState]);

  // カテゴリ一覧を整形
  const categories: CategoryRow[] = (taskDefinitionData ?? []).map(cat => ({
    id: cat.id,
    name: cat.name,
    tasks: (cat.tasks ?? []).map((t: any) => ({
      id: t.id,
      label: t.label,
      showOnDays: t.showOnDays ?? "",
      deadline: t.deadline ?? "",
      defaultPlanned: t.defaultPlanned ?? "",
      categoryId: cat.id,
      sortOrder: t.sortOrder ?? 0,
    })),
  }));

  // フィルタリング
  const filteredCategories = categories.map(cat => ({
    ...cat,
    tasks: filterMode === "limited"
      ? cat.tasks.filter(t => (t.showOnDays ?? "").trim() !== "")
      : cat.tasks,
  })).filter(cat => cat.tasks.length > 0);

  // 制限設定済みタスクを日付順・3グループに整形
  const limitedTasksGrouped = useMemo(() => {
    if (filterMode !== "limited") return null;
    // 全カテゴリから制限設定済みタスクをフラット化
    const allLimited: (TaskDefRow & { categoryName: string })[] = [];
    categories.forEach(cat => {
      cat.tasks.forEach(t => {
        if ((t.showOnDays ?? "").trim() !== "") {
          allLimited.push({ ...t, categoryName: cat.name });
        }
      });
    });
    // showOnDaysの最小値（最初の表示日）でソート
    allLimited.sort((a, b) => {
      const aMin = Math.min(...parseShowOnDays(a.showOnDays ?? ""));
      const bMin = Math.min(...parseShowOnDays(b.showOnDays ?? ""));
      return aMin - bMin;
    });
    // 月初(1-10)・中旬(11-20)・月末(21-31) に分類
    const groups = [
      { label: "月初（1〜10日）", range: [1, 10], tasks: [] as (TaskDefRow & { categoryName: string })[] },
      { label: "中旬（11〜20日）", range: [11, 20], tasks: [] as (TaskDefRow & { categoryName: string })[] },
      { label: "月末（21〜31日）", range: [21, 31], tasks: [] as (TaskDefRow & { categoryName: string })[] },
    ];
    allLimited.forEach(t => {
      const minDay = Math.min(...parseShowOnDays(t.showOnDays ?? ""));
      if (minDay <= 10) groups[0].tasks.push(t);
      else if (minDay <= 20) groups[1].tasks.push(t);
      else groups[2].tasks.push(t);
    });
    return groups.filter(g => g.tasks.length > 0);
  }, [filterMode, categories]);

  // 統計
  const totalTasks = categories.reduce((sum, cat) => sum + cat.tasks.length, 0);
  const limitedTasks = categories.reduce((sum, cat) =>
    sum + cat.tasks.filter(t => (t.showOnDays ?? "").trim() !== "").length, 0);
  const overdueToday = categories.reduce((sum, cat) =>
    sum + cat.tasks.filter(t => {
      const s = t.showOnDays ?? "";
      if (s.trim() === "") return false;
      if (!isOverdueToday(s) || isVisibleToday(s)) return false;
      // 完了済みタスクは期限超過としてカウントしない
      const state = taskStateMap.get(`def-${t.id}`);
      return !state?.done;
    }).length, 0);
  // 今日の制限タスクのうち完了済み件数
  const completedLimitedToday = categories.reduce((sum, cat) =>
    sum + cat.tasks.filter(t => {
      const s = t.showOnDays ?? "";
      if (s.trim() === "") return false;
      const state = taskStateMap.get(`def-${t.id}`);
      return !!state?.done;
    }).length, 0);

  const today = new Date();
  const todayStr = `${today.getMonth() + 1}月${today.getDate()}日（${"日月火水木金土"[today.getDay()]}）`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-blue-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-500 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              タスク管理へ戻る
            </button>
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-blue-700">
              <CalendarDays className="w-4 h-4" />
              ルーティン一覧
            </span>
            <span className="text-xs text-gray-400 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
              {limitedTasks}件設定中
            </span>
            {overdueToday > 0 && (
              <span className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                期限超過 {overdueToday}件
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {lastSaved && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                {lastSaved}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">

        {/* 今日の状況サマリー */}
        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-gray-700">今日の状況 — {todayStr}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-700">{totalTasks}</p>
              <p className="text-xs text-gray-400 mt-0.5">総タスク数</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{limitedTasks}</p>
              <p className="text-xs text-blue-400 mt-0.5">表示日制限あり</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{completedLimitedToday}</p>
              <p className="text-xs text-green-400 mt-0.5">制限タスク完了済み</p>
            </div>
            <div className={`text-center p-3 rounded-lg ${overdueToday > 0 ? "bg-red-50" : "bg-gray-50"}`}>
              <p className={`text-2xl font-bold ${overdueToday > 0 ? "text-red-600" : "text-gray-400"}`}>
                {overdueToday}
              </p>
              <p className={`text-xs mt-0.5 ${overdueToday > 0 ? "text-red-400" : "text-gray-300"}`}>
                期限超過中
              </p>
            </div>
          </div>
        </div>

        {/* フィルター切り替え */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterMode("limited")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              filterMode === "limited"
                ? "bg-blue-500 text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:border-blue-300"
            }`}
          >
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              制限設定済みのみ ({limitedTasks}件)
            </span>
          </button>
          <button
            onClick={() => setFilterMode("all")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              filterMode === "all"
                ? "bg-gray-600 text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              全タスク表示 ({totalTasks}件)
            </span>
          </button>
        </div>

        {/* タスク一覧：制限設定済みは日付順グループ（3列）、全表示はカテゴリ別 */}
        {filterMode === "limited" ? (
          !limitedTasksGrouped || limitedTasksGrouped.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400 font-medium">表示日制限が設定されたタスクはありません</p>
              <p className="text-xs text-gray-300 mt-1">
                「全タスク表示」に切り替えて、制限を設定したいタスクの編集ボタンをクリックしてください
              </p>
            </div>
          ) : (
            // 月初・中旬・月末の3列グリッド（常に3列を表示、タスクがない列は空欄）
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {[
                { label: "月初（1〜10日）", range: [1, 10] as [number, number] },
                { label: "中旬（11〜20日）", range: [11, 20] as [number, number] },
                { label: "月末（21〜31日）", range: [21, 31] as [number, number] },
              ].map(col => {
                const group = limitedTasksGrouped.find(g => g.label === col.label);
                const colColors = {
                  "月初（1〜10日）": { header: "from-blue-50", border: "border-blue-100", icon: "text-blue-500", text: "text-blue-700", badge: "bg-blue-100 text-blue-400" },
                  "中旬（11〜20日）": { header: "from-violet-50", border: "border-violet-100", icon: "text-violet-500", text: "text-violet-700", badge: "bg-violet-100 text-violet-400" },
                  "月末（21〜31日）": { header: "from-emerald-50", border: "border-emerald-100", icon: "text-emerald-500", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-400" },
                } as const;
                const c = colColors[col.label as keyof typeof colColors];
                return (
                  <div key={col.label} className={`bg-white rounded-xl border ${c.border} shadow-sm overflow-hidden`}>
                    {/* 列ヘッダー */}
                    <div className={`px-4 py-2.5 bg-gradient-to-r ${c.header} to-white border-b ${c.border} flex items-center gap-2`}>
                      <CalendarDays className={`w-3.5 h-3.5 ${c.icon}`} />
                      <span className={`text-xs font-bold ${c.text}`}>{col.label}</span>
                      <span className={`text-[10px] ${c.badge} px-1.5 py-0.5 rounded-full`}>
                        {group ? group.tasks.length : 0}件
                      </span>
                    </div>
                    {/* タスク一覧 */}
                    <div className="p-3 space-y-2">
                      {group && group.tasks.length > 0 ? (
                        group.tasks.map(task => (
                          <div key={task.id}>
                            <div className="mb-1">
                              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                                {task.categoryName}
                              </span>
                            </div>
                            <TaskRow task={task} taskState={taskStateMap.get(`def-${task.id}`)} todayDateKey={todayDateKey} onSave={handleSave} onSaveCompletedDate={handleSaveCompletedDate} />
                          </div>
                        ))
                      ) : (
                        <div className="py-6 text-center">
                          <p className="text-xs text-gray-300">この期間のルーティンはありません</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          filteredCategories.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
              <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400 font-medium">タスクがありません</p>
            </div>
          ) : (
            filteredCategories.map(cat => (
              <div key={cat.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* カテゴリヘッダー */}
                <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-white border-b border-blue-100 flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-700">{cat.name}</span>
                  <span className="text-[10px] text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded-full">
                    {cat.tasks.length}件
                  </span>
                </div>
                {/* タスク一覧 */}
                <div className="p-3 space-y-2">
                  {cat.tasks.map(task => (
                    <TaskRow key={task.id} task={task} taskState={taskStateMap.get(`def-${task.id}`)} todayDateKey={todayDateKey} onSave={handleSave} onSaveCompletedDate={handleSaveCompletedDate} />
                  ))}
                </div>
              </div>
            ))
          )
        )}

        {/* 使い方ガイド */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            表示日の設定方法
          </h3>
          <div className="space-y-1.5 text-xs text-gray-500">
            <p>• <strong>毎月1〜5日のみ表示：</strong> <code className="bg-gray-100 px-1 rounded">1,2,3,4,5</code></p>
            <p>• <strong>毎月15〜20日のみ表示：</strong> <code className="bg-gray-100 px-1 rounded">15,16,17,18,19,20</code></p>
            <p>• <strong>毎月25日のみ表示：</strong> <code className="bg-gray-100 px-1 rounded">25</code></p>
            <p>• <strong>毎月15日と30日のみ表示：</strong> <code className="bg-gray-100 px-1 rounded">15,30</code></p>
            <p>• <strong>毎日表示（制限なし）：</strong> 空欄のまま保存</p>
            <p className="text-gray-400 mt-2">※ 期限日（showOnDaysの最大値）を過ぎても未完了の場合は、完了するまで継続表示されます。</p>
          </div>
        </div>
      </div>
    </div>
  );
}

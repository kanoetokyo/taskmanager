/**
 * タスク管理アプリ - メインページ
 * Design: Structured Utility (Refined)
 * - タスクごとにlucide-reactアイコンを表示
 * - 白背景・グレー区切り線のクリーンなレイアウト
 * - カテゴリカードにカラーアクセント左ボーダー
 * - 作業予定者（デフォルト：当日事務担当）・実施者プルダウン
 * - 完了チェックボックス・進捗バー
 * - 前日・翌日ナビゲーション（日付ごとにlocalStorage保存）
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MessageCircle,
  Tablet,
  Package,
  Mail,
  ShoppingBag,
  Phone,
  BarChart2,
  Bell,
  HeartHandshake,
  CreditCard,
  Users,
  CalendarPlus,
  Send,
  ClipboardList,
  AlertCircle,
  Eraser,
  SlidersHorizontal,
  FileText,
  Undo2,
  CalendarCheck,
  CheckCircle2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

const PLANNED_MEMBERS = ["当日事務担当", "当日現場責任者", "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "四藤", "ウララ", "森山", "その他"];
const ACTUAL_MEMBERS  = ["", "当日事務担当", "当日現場責任者", "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "四藤", "ウララ", "森山", "その他"];

interface TaskDef {
  id: string;
  category: string;
  label: string;
  icon: React.ReactNode;
  defaultPlanned?: string;  // デフォルト担当者（未指定時は「当日事務担当」）
  deadline?: string;        // 期限表示（例: "17:00まで"）
}

interface Task extends TaskDef {
  planned: string;
  actual: string;
  done: boolean;
  help: boolean;
}

// ─── Task Definitions ────────────────────────────────────────────────────────

const iconSize = "w-4 h-4 shrink-0";

const BASE_TASKS: TaskDef[] = [
  { id: "sys-a-1", category: "各種システムのチェック", label: "公式LINEの要対応なものチェック（前日１８：００以降に発生）（大井町店）",       icon: <MessageCircle className={iconSize} />, deadline: "12:00まで" },
  { id: "sys-a-2", category: "各種システムのチェック", label: "公式LINEの要対応なものチェック（前日１８：００以降に発生）（大森南店）",       icon: <MessageCircle className={iconSize} />, deadline: "12:00まで" },
  { id: "sys-a-3", category: "各種システムのチェック", label: "公式LINEの要対応なものチェック（前日１８：００以降に発生）（天満店）",         icon: <MessageCircle className={iconSize} />, deadline: "12:00まで" },
  { id: "sys-a-4", category: "各種システムのチェック", label: "公式LINEの要対応なものチェック（前日１８：００以降に発生）（戸越銀座駅前店）", icon: <MessageCircle className={iconSize} />, deadline: "12:00まで" },
  { id: "sys-a-5", category: "各種システムのチェック", label: "公式LINEの要対応なものチェック（前日１８：００以降に発生）（大田中央店）",     icon: <MessageCircle className={iconSize} />, deadline: "12:00まで" },
  { id: "sys-a-6", category: "各種システムのチェック", label: "公式LINEの要対応なものチェック（前日１８：００以降に発生）（川崎新町店）",     icon: <MessageCircle className={iconSize} />, deadline: "12:00まで" },
  { id: "sys-a-7", category: "各種システムのチェック", label: "公式LINEの要対応なものチェック（前日１８：００以降に発生）（幸塚越店）",       icon: <MessageCircle className={iconSize} />, deadline: "12:00まで" },
  { id: "sys-b-1", category: "各種システムのチェック", label: "POSのチェック（大井町店）",            icon: <Tablet className={iconSize} /> },
  { id: "sys-b-2", category: "各種システムのチェック", label: "POSのチェック（大森南店）",            icon: <Tablet className={iconSize} /> },
  { id: "sys-b-3", category: "各種システムのチェック", label: "POSのチェック（天満店）",              icon: <Tablet className={iconSize} /> },
  { id: "sys-b-4", category: "各種システムのチェック", label: "POSのチェック（戸越銀座駅前店）",      icon: <Tablet className={iconSize} /> },
  { id: "sys-b-5", category: "各種システムのチェック", label: "POSのチェック（大田中央店）",          icon: <Tablet className={iconSize} /> },
  { id: "sys-b-6", category: "各種システムのチェック", label: "POSのチェック（川崎新町店）",          icon: <Tablet className={iconSize} /> },
  { id: "sys-b-7", category: "各種システムのチェック", label: "POSのチェック（幸塚越店）",            icon: <Tablet className={iconSize} /> },
  { id: "sys-c-1", category: "各種システムのチェック", label: "ラクーンのチェック（大井町店）",       icon: <Package className={iconSize} /> },
  { id: "sys-c-2", category: "各種システムのチェック", label: "ラクーンのチェック（大森南店）",       icon: <Package className={iconSize} /> },
  { id: "sys-c-3", category: "各種システムのチェック", label: "ラクーンのチェック（天満店）",         icon: <Package className={iconSize} /> },
  { id: "sys-c-4", category: "各種システムのチェック", label: "ラクーンのチェック（戸越銀座駅前店）", icon: <Package className={iconSize} /> },
  { id: "sys-c-5", category: "各種システムのチェック", label: "ラクーンのチェック（大田中央店）",     icon: <Package className={iconSize} /> },
  { id: "sys-c-6", category: "各種システムのチェック", label: "ラクーンのチェック（川崎新町店）",     icon: <Package className={iconSize} /> },
  { id: "sys-c-7", category: "各種システムのチェック", label: "ラクーンのチェック（幸塚越店）",       icon: <Package className={iconSize} /> },
  { id: "sys-d-1", category: "各種システムのチェック", label: "メールのチェック（osouji.oimachi@gmail.com）", icon: <Mail className={iconSize} /> },
  { id: "sys-e-1", category: "各種システムのチェック", label: "Storesの予約確認チェック",             icon: <ShoppingBag className={iconSize} /> },

  // 顧客対応と事務作業
  { id: "cust-a", category: "顧客対応と事務作業", label: "電話対応（フリーダイヤル）および顧客対応（LINE・来店・メールなど）", icon: <Phone className={iconSize} /> },
  { id: "cust-b", category: "顧客対応と事務作業", label: "案件完了ごとの売上表更新・POSおよびラクーンの完了処理",           icon: <BarChart2 className={iconSize} /> },
  { id: "cust-c", category: "顧客対応と事務作業", label: "公式LINEからの前日リマインド送信",                               icon: <Bell className={iconSize} /> },
  { id: "cust-d", category: "顧客対応と事務作業", label: "公式LINEからのアフターフォローの実施",                           icon: <HeartHandshake className={iconSize} /> },

  // 決済確認
  { id: "pay-a", category: "決済確認", label: "SquareとPayPayの決済額とカレンダー内容が一致しているかの照合", icon: <CreditCard className={iconSize} /> },

  // LINEグループ管理
  { id: "line-a", category: "LINEグループ管理", label: "事務グループ（4グループのいずれか）への日付メッセージ投稿", icon: <Users className={iconSize} /> },
  { id: "line-b", category: "LINEグループ管理", label: "翌日の稼働グループの作成",                                 icon: <CalendarPlus className={iconSize} /> },
  { id: "line-c", category: "LINEグループ管理", label: "翌日のスケジュールと配車を確定させて配信する", icon: <Send className={iconSize} />, defaultPlanned: "当日現場責任者", deadline: "17:00まで" },

  // 清掃管理
  { id: "clean-a", category: "アットイン清掃管理システム確認", label: "翌日入居で清掃が漏れていないかの確認", icon: <AlertCircle className={iconSize} />, defaultPlanned: "当日現場責任者", deadline: "12:00まで" },
  { id: "clean-b", category: "アットイン清掃管理システム確認", label: "赤くなっている清掃カードの消し込み作業",                                         icon: <Eraser className={iconSize} /> },

  // 調整および書類作成
  { id: "doc-a", category: "調整および書類作成", label: "STORESの空き枠のシフト調整",         icon: <SlidersHorizontal className={iconSize} /> },
  { id: "doc-b", category: "調整および書類作成", label: "翌日の見積もり作成および印刷",     icon: <FileText className={iconSize} /> },

  // 大森事務でのTODO
  { id: "omori-a", category: "大森事務でのTODO", label: "前日の売上日報の確認",                 icon: <BarChart2 className={iconSize} />, defaultPlanned: "当日現場責任者" },
  { id: "omori-b", category: "大森事務でのTODO", label: "前日のインセンティブ報告の内容確認",         icon: <ClipboardList className={iconSize} />, defaultPlanned: "当日現場責任者" },
  { id: "omori-c", category: "大森事務でのTODO", label: "1週間先までのグレーセルの確認", icon: <SlidersHorizontal className={iconSize} />, defaultPlanned: "当日現場責任者" },
  { id: "omori-d", category: "大森事務でのTODO", label: "現金確認",                         icon: <CreditCard className={iconSize} />, defaultPlanned: "当日現場責任者" },
];

// ─── Category Config ──────────────────────────────────────────────────────────

interface CatConfig {
  border: string;   // left border color
  badge: string;    // header badge bg + text
  icon: React.ReactNode;
}

const CAT_CONFIG: Record<string, CatConfig> = {
  "各種システムのチェック":         { border: "border-blue-400",   badge: "bg-blue-100 text-blue-700",   icon: <Tablet className="w-4 h-4" /> },
  "顧客対応と事務作業":             { border: "border-green-400",  badge: "bg-green-100 text-green-700", icon: <Phone className="w-4 h-4" /> },
  "決済確認":                       { border: "border-amber-400",  badge: "bg-amber-100 text-amber-700", icon: <CreditCard className="w-4 h-4" /> },
  "LINEグループ管理":               { border: "border-cyan-400",   badge: "bg-cyan-100 text-cyan-700",   icon: <MessageCircle className="w-4 h-4" /> },
  "アットイン清掃管理システム確認": { border: "border-orange-400", badge: "bg-orange-100 text-orange-700", icon: <ClipboardList className="w-4 h-4" /> },
  "調整および書類作成":             { border: "border-violet-400", badge: "bg-violet-100 text-violet-700", icon: <FileText className="w-4 h-4" /> },
  "大森事務でのTODO":             { border: "border-rose-400",   badge: "bg-rose-100 text-rose-700",   icon: <ClipboardList className="w-4 h-4" /> },
};

// ─── Icon color per task type ─────────────────────────────────────────────────

const ICON_COLOR: Record<string, string> = {
  "sys-a": "text-green-500",
  "sys-b": "text-blue-500",
  "sys-c": "text-indigo-500",
  "sys-d": "text-red-400",
  "sys-e": "text-orange-400",
  "cust":  "text-teal-500",
  "pay":   "text-amber-500",
  "line":  "text-cyan-500",
  "clean": "text-orange-500",
  "doc":   "text-violet-500",
  "omori": "text-rose-500",
};

function getIconColor(id: string): string {
  for (const [prefix, color] of Object.entries(ICON_COLOR)) {
    if (id.startsWith(prefix)) return color;
  }
  return "text-gray-400";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInitialTasks(): Task[] {
  return BASE_TASKS.map(t => ({ ...t, planned: t.defaultPlanned ?? "当日事務担当", actual: "", done: false, help: false }));
}

function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayKey(): string { return dateToKey(new Date()); }

function formatDateLabel(key: string): { main: string; sub: string } {
  const d = keyToDate(key);
  const today = todayKey();
  const yesterday = dateToKey(new Date(Date.now() - 86400000));
  const tomorrow  = dateToKey(new Date(Date.now() + 86400000));
  const dayNames  = ["日", "月", "火", "水", "木", "金", "土"];
  const main = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${dayNames[d.getDay()]}）`;
  const sub  = key === today ? "今日" : key === yesterday ? "昨日" : key === tomorrow ? "明日" : "";
  return { main, sub };
}

function storageKey(dateKey: string): string { return `task-manager-${dateKey}`; }

function loadTasks(dateKey: string): Task[] {
  try {
    const saved = localStorage.getItem(storageKey(dateKey));
    if (saved) {
      const parsed = JSON.parse(saved) as Task[];
      return BASE_TASKS.map(t => {
        const found = parsed.find(p => p.id === t.id);
        return found
          ? { ...t, planned: found.planned ?? (t.defaultPlanned ?? "当日事務担当"), actual: found.actual ?? "", done: found.done ?? false, help: found.help ?? false }
          : { ...t, planned: t.defaultPlanned ?? "当日事務担当", actual: "", done: false, help: false };
      });
    }
  } catch {}
  return makeInitialTasks();
}

function saveTasks(dateKey: string, tasks: Task[]) {
  localStorage.setItem(storageKey(dateKey), JSON.stringify(tasks));
}

// ─── Handover Memo ──────────────────────────────────────────────────────────

const HANDOVER_MEMBERS = ["前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "四藤", "ウララ", "森山"];

interface HandoverItem {
  id: string;
  author: string;   // 作成者
  text: string;
  checked: string[]; // 確認済みメンバー名
  inherited?: boolean; // 前日から引き継ぎされたか
}

function handoverKey(dateKey: string): string { return `handover2-${dateKey}`; }

function newHandoverItem(): HandoverItem {
  return { id: crypto.randomUUID(), author: "", text: "", checked: [] };
}

function loadHandover(dateKey: string): HandoverItem[] {
  try {
    const saved = localStorage.getItem(handoverKey(dateKey));
    if (saved) return JSON.parse(saved) as HandoverItem[];
  } catch {}
  // 未保存の場合、前日の未確認メモを引き継ぎ
  try {
    const prevDate = keyToDate(dateKey);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevKey = dateToKey(prevDate);
    const prevSaved = localStorage.getItem(handoverKey(prevKey));
    if (prevSaved) {
      const prevItems = JSON.parse(prevSaved) as HandoverItem[];
      // テキストがあり全員未確認のものだけ引き継ぎ（確認リセット）
      const inherited = prevItems
        .filter(item => item.text && item.checked.length < HANDOVER_MEMBERS.length)
        .map(item => ({ ...item, id: crypto.randomUUID(), checked: [], inherited: true }));
      if (inherited.length > 0) {
        return [...inherited, newHandoverItem()];
      }
    }
  } catch {}
  return [newHandoverItem()];
}

function saveHandover(dateKey: string, items: HandoverItem[]) {
  localStorage.setItem(handoverKey(dateKey), JSON.stringify(items));
}

// ─── Customer Handover ─────────────────────────────────────────────────────

const CUSTOMER_STATUSES = ["不通・未対応", "調整中・仮予約中", "保留"] as const;
const CUSTOMER_STATUSES_ALL = [...CUSTOMER_STATUSES, "完了"] as const;
type CustomerStatus = typeof CUSTOMER_STATUSES_ALL[number];

const STORES = ["大井町店", "大森南店", "天満店", "戸越銀座駅前店", "大田中央店", "川崎新町店", "幸塚越店"];
const CONTACT_OPTIONS = [
  "作業時追加",
  ...STORES.map(s => `POS(${s})`),
  ...STORES.map(s => `ラクーン(${s})`),
  ...STORES.map(s => `LINE(${s})`),
  "フリーダイヤル",
  "来店",
  "SMS",
];

const STATUS_STYLE: Record<CustomerStatus, string> = {
  "不通・未対応": "bg-red-100 text-red-700 border-red-300",
  "調整中・仮予約中": "bg-yellow-100 text-yellow-700 border-yellow-300",
  "保留": "bg-gray-100 text-gray-600 border-gray-300",
  "完了": "bg-green-100 text-green-700 border-green-300",
};

interface CustomerRecord {
  id: string;
  name: string;
  status: CustomerStatus;
  contact: string;
  memo: string;
  inherited?: boolean; // 前日から引き継ぎされたか
}

function customerKey(dateKey: string): string { return `customers-${dateKey}`; }

function newCustomerRecord(): CustomerRecord {
  return { id: crypto.randomUUID(), name: "", status: "不通・未対応", contact: "", memo: "" };
}

function loadCustomers(dateKey: string): CustomerRecord[] {
  try {
    const saved = localStorage.getItem(customerKey(dateKey));
    if (saved) return JSON.parse(saved) as CustomerRecord[];
  } catch {}
  // 未保存の場合、前日の未完了顧客を引き継ぎ
  try {
    const prevDate = keyToDate(dateKey);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevKey = dateToKey(prevDate);
    const prevSaved = localStorage.getItem(customerKey(prevKey));
    if (prevSaved) {
      const prevItems = JSON.parse(prevSaved) as CustomerRecord[];
      // 完了以外の顧客を新しいIDで引き継ぎ
      const inherited = prevItems
        .filter(c => c.status !== "完了")
        .map(c => ({ ...c, id: crypto.randomUUID(), inherited: true }));
      return inherited;
    }
  } catch {}
  return [];
}

function saveCustomers(dateKey: string, items: CustomerRecord[]) {
  localStorage.setItem(customerKey(dateKey), JSON.stringify(items));
}

// ─── MISOCA Status ───────────────────────────────────────────────────────────

const MISOCA_STORAGE_KEY = "misoca-status";

interface MisocaStatus {
  completedUntil: string; // YYYY-MM-DD 形式。この日付まで見積書作成済み
}

function loadMisoca(): MisocaStatus {
  try {
    const saved = localStorage.getItem(MISOCA_STORAGE_KEY);
    if (saved) return JSON.parse(saved) as MisocaStatus;
  } catch {}
  return { completedUntil: "" };
}

function saveMisoca(status: MisocaStatus) {
  localStorage.setItem(MISOCA_STORAGE_KEY, JSON.stringify(status));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [currentDateKey, setCurrentDateKey] = useState<string>(todayKey);
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(todayKey()));
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState<boolean>(false);
  const [showPrevUndone, setShowPrevUndone] = useState<boolean>(false);
  const [handoverItems, setHandoverItems] = useState<HandoverItem[]>(() => loadHandover(todayKey()));
  const [undoHistory, setUndoHistory] = useState<Task[][]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>(() => loadCustomers(todayKey()));
  const [misoca, setMisoca] = useState<MisocaStatus>(() => loadMisoca());

  useEffect(() => {
    setTasks(loadTasks(currentDateKey));
    setHandoverItems(loadHandover(currentDateKey));
    setCustomers(loadCustomers(currentDateKey));
    setLastSaved(null);
    setUndoHistory([]);
  }, [currentDateKey]);

  // MISOCA自動保存
  useEffect(() => {
    saveMisoca(misoca);
  }, [misoca]);

  // 顧客引き継ぎ自動保存
  useEffect(() => {
    const timer = setTimeout(() => saveCustomers(currentDateKey, customers), 800);
    return () => clearTimeout(timer);
  }, [customers, currentDateKey]);

  const addCustomer = () => setCustomers(prev => [...prev, newCustomerRecord()]);

  const updateCustomer = (id: string, field: keyof CustomerRecord, value: string) => {
    setCustomers(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, [field]: value };
      // 完了に変更した場合は1秒後に自動削除
      if (field === "status" && value === "完了") {
        setTimeout(() => {
          setCustomers(p => p.filter(r => r.id !== id));
          toast.success("顧客引き継ぎを完了として削除しました");
        }, 800);
      }
      return updated;
    }));
  };

  const deleteCustomer = (id: string) => {
    if (!confirm("この顧客引き継ぎを削除しますか？")) return;
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  // 引き継ぎメモ自動保存
  useEffect(() => {
    const timer = setTimeout(() => saveHandover(currentDateKey, handoverItems), 800);
    return () => clearTimeout(timer);
  }, [handoverItems, currentDateKey]);

  const addHandoverItem = () => {
    setHandoverItems(prev => [...prev, newHandoverItem()]);
  };

  const updateHandoverItem = (id: string, field: keyof HandoverItem, value: string) => {
    setHandoverItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const deleteHandoverItem = (id: string) => {
    setHandoverItems(prev => prev.filter(item => item.id !== id));
  };

  const toggleHandoverCheck = (itemId: string, member: string) => {
    setHandoverItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const alreadyChecked = item.checked.includes(member);
      const newChecked = alreadyChecked
        ? item.checked.filter((m: string) => m !== member)
        : [...item.checked, member];
      // 全員チェック完了時はそのアイテムを削除
      if (!alreadyChecked && newChecked.length === HANDOVER_MEMBERS.length) {
        setTimeout(() => {
          setHandoverItems(p => {
            const remaining = p.filter(i => i.id !== itemId);
            if (remaining.length === 0) return [newHandoverItem()];
            return remaining;
          });
          toast.success("全員が確認しました。引き継ぎメモをクリアしました。");
        }, 600);
      }
      return { ...item, checked: newChecked };
    }));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      saveTasks(currentDateKey, tasks);
      const now = new Date();
      setLastSaved(`自動保存済み ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
    }, 800);
    return () => clearTimeout(timer);
  }, [tasks, currentDateKey]);

  const goToPrevDay = useCallback(() => {
    const d = keyToDate(currentDateKey); d.setDate(d.getDate() - 1);
    setCurrentDateKey(dateToKey(d));
  }, [currentDateKey]);

  const goToNextDay = useCallback(() => {
    const d = keyToDate(currentDateKey); d.setDate(d.getDate() + 1);
    setCurrentDateKey(dateToKey(d));
  }, [currentDateKey]);

  const goToToday = useCallback(() => setCurrentDateKey(todayKey()), []);

  const updateTask = (id: string, field: "planned" | "actual", value: string) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));

  const toggleDone = (id: string) => {
    setTasks(prev => {
      setUndoHistory(h => [...h.slice(-9), prev]);
      return prev.map(t => t.id === id ? { ...t, done: !t.done } : t);
    });
  };

  const undoLast = () => {
    setUndoHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setTasks(prev);
      toast.success("元に戻しました");
      return h.slice(0, -1);
    });
  };

  const toggleHelp = (id: string) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, help: !t.help } : t));

  const markAllPrevDone = () => {
    const prevKey = (() => { const d = keyToDate(currentDateKey); d.setDate(d.getDate() - 1); return dateToKey(d); })();
    const prevTasks = loadTasks(prevKey);
    const updated = prevTasks.map(t => ({ ...t, done: true }));
    saveTasks(prevKey, updated);
    toast.success("前日の未完了タスクをすべて完了にしました");
    // 画面を再レンダリングさせるために現在日のデータを再読み込み
    setTasks(prev => [...prev]);
  };

  const handleReset = () => {
    if (!confirm("この日の全設定をリセットしますか？")) return;
    setTasks(makeInitialTasks());
    localStorage.removeItem(storageKey(currentDateKey));
    setLastSaved(null);
    toast.info("リセットしました");
  };

  const isToday = currentDateKey === todayKey();
  const totalTasks = tasks.length;
  const doneTasks  = tasks.filter(t => t.done).length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const categories  = Array.from(new Set(BASE_TASKS.map(t => t.category)));
  const { main: dateMain, sub: dateSub } = formatDateLabel(currentDateKey);

  // 前日の未完了タスクを取得
  const prevDayKey = (() => { const d = keyToDate(currentDateKey); d.setDate(d.getDate() - 1); return dateToKey(d); })();
  const prevDayTasks = loadTasks(prevDayKey);
  const prevDayUndoneTasks = prevDayTasks.filter(t => !t.done);
  const { main: prevDateMain } = formatDateLabel(prevDayKey);

  return (
    <div className="min-h-screen" style={{ background: "#f4f6f9" }}>

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">

          {/* Title */}
          <span className="text-base font-bold text-gray-800 shrink-0">タスク管理革命</span>

          {/* Date nav */}
          <div className="flex items-center gap-1 flex-1 justify-center">
            <button onClick={goToPrevDay} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors" title="前日">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center px-1">
              <span className="text-sm font-semibold text-gray-800">{dateMain}</span>
              {dateSub && (
                <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">{dateSub}</span>
              )}
            </div>
            <button onClick={goToNextDay} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors" title="翌日">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Hide-done toggle + Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle switch */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <span className="text-xs text-gray-500 hidden sm:inline whitespace-nowrap">完了済みを隠す</span>
              <button
                role="switch"
                aria-checked={hideDone}
                onClick={() => setHideDone(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
                  hideDone ? "bg-blue-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    hideDone ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
            {!isToday && (
              <button onClick={goToToday} className="text-xs px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                今日へ
              </button>
            )}
            {lastSaved && <span className="text-gray-400 text-xs hidden sm:inline">{lastSaved}</span>}
            <button
              onClick={undoLast}
              disabled={undoHistory.length === 0}
              title="元に戻す"
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                undoHistory.length > 0
                  ? "border-blue-300 text-blue-600 hover:bg-blue-50"
                  : "border-gray-200 text-gray-300 cursor-not-allowed"
              }`}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">元に戻す</span>
            </button>
            <button onClick={handleReset} className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
              リセット
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-4xl mx-auto px-4 pb-2.5 flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: progressPct === 100 ? "#22c55e" : "#3b82f6" }}
            />
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
            {doneTasks} / {totalTasks}　{progressPct}%
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* 前日未完了タスクアラート */}
        {prevDayUndoneTasks.length > 0 && (
          <section className="bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-xl shadow-sm overflow-hidden">
            {/* ヘッダー（常に表示） */}
            <div className="w-full px-4 py-2.5 flex items-center justify-between border-b border-red-100">
              <button
                onClick={() => setShowPrevUndone(v => !v)}
                className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  前日（{prevDateMain}）の未完了タスク
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => markAllPrevDone()}
                  className="text-xs px-2.5 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white font-medium transition-colors shadow-sm"
                >
                  一括完了
                </button>
                <span className="text-xs font-semibold text-red-500">{prevDayUndoneTasks.length}件未完了</span>
                <button
                  onClick={() => setShowPrevUndone(v => !v)}
                  className="text-red-400 hover:opacity-70 transition-opacity"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showPrevUndone ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
            {/* 展開時のタスク一覧 */}
            {showPrevUndone && (
              <div className="divide-y divide-red-100">
                {prevDayUndoneTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="text-red-400 shrink-0">{task.icon}</span>
                    <span className="flex-1 text-sm text-red-800">{task.label}</span>
                    {task.planned && (
                      <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded-full shrink-0">{task.planned}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {/* 引き継ぎメモパネル */}
        <section className="bg-white border border-gray-200 border-l-4 border-l-yellow-400 rounded-xl shadow-sm overflow-hidden">
          {/* ヘッダー */}
          <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
              <ClipboardList className="w-4 h-4" />
              引き継ぎメモ
            </span>
            <button
              onClick={addHandoverItem}
              className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-yellow-300 text-yellow-700 hover:bg-yellow-50 transition-colors font-medium"
            >
              <span className="text-base leading-none">+</span> メモを追加
            </button>
          </div>

          {/* 各メモ */}
          <div className="divide-y divide-gray-100">
            {handoverItems.map((item, idx) => (
              <div key={item.id} className="px-4 py-3 space-y-2">
                {/* 作成者選択 + 削除ボタン */}
                <div className="flex items-center gap-2">
                  <select
                    value={item.author}
                    onChange={e => updateHandoverItem(item.id, "author", e.target.value)}
                    className={`text-xs px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-yellow-400 ${
                      item.author ? "border-yellow-300 text-yellow-800 bg-yellow-50" : "border-gray-200 text-gray-400 bg-gray-50"
                    }`}
                  >
                    <option value="">作成者を選択</option>
                    {HANDOVER_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  {item.inherited && (
                    <span className="flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200">
                      ↩ 前日から引き継ぎ
                    </span>
                  )}
                  {item.author && !item.inherited && (
                    <span className="text-xs text-gray-400">メモ {idx + 1}</span>
                  )}
                  {handoverItems.length > 1 && (
                    <button
                      onClick={() => deleteHandoverItem(item.id)}
                      className="ml-auto text-xs text-gray-300 hover:text-red-400 transition-colors px-1"
                      title="このメモを削除"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* テキスト入力 */}
                <textarea
                  value={item.text}
                  onChange={e => updateHandoverItem(item.id, "text", e.target.value)}
                  placeholder="引き継ぎ事項を入力してください…"
                  rows={2}
                  className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-yellow-400 placeholder-gray-300"
                />

                {/* 全員確認チェック（テキストがあるときのみ） */}
                {item.text && (
                  <div className="space-y-1.5">
                  <p className="text-xs text-yellow-700 font-medium flex items-center gap-1">
                    <span>⚠️</span>内容を確認した方はお名前をタップしてください
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {HANDOVER_MEMBERS.map(member => {
                      const isChecked = item.checked.includes(member);
                      return (
                        <button
                          key={member}
                          onClick={() => toggleHandoverCheck(item.id, member)}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                            isChecked
                              ? "bg-green-500 border-green-500 text-white shadow-sm"
                              : "bg-white border-gray-200 text-gray-500 hover:border-yellow-300 hover:text-yellow-700"
                          }`}
                        >
                          {isChecked ? "✓ " : ""}{member}
                        </button>
                      );
                    })}
                    <span className="self-center text-xs text-gray-400 ml-1">
                      {item.checked.length === HANDOVER_MEMBERS.length
                        ? "✨ 全員確認完了！"
                        : `${item.checked.length}/${HANDOVER_MEMBERS.length}名確認済`
                      }
                    </span>
                  </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 顧客引き継ぎダッシュボード */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 border-l-blue-400">
          <div className="px-4 py-2.5 border-b border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                <Users className="w-4 h-4" />
                顧客引き継ぎ
              </span>
              <button
                onClick={addCustomer}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors shadow-sm"
              >
                <span className="text-base leading-none">+</span> 顧客を追加
              </button>
            </div>
            {customers.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["不通・未対応", "調整中・仮予約中", "保留"] as const).map(status => {
                  const count = customers.filter(c => c.status === status).length;
                  if (count === 0) return null;
                  const style = STATUS_STYLE[status];
                  return (
                    <span key={status} className={`text-xs font-medium px-2 py-0.5 rounded-full border tabular-nums ${style}`}>
                      {status}：{count}件
                    </span>
                  );
                })}
                <span className="text-xs text-gray-400 tabular-nums ml-1">合計 {customers.length}件</span>
              </div>
            )}
          </div>

          {customers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              引き継ぎが必要な顧客を追加してください
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {customers.map(c => (
                <div key={c.id} className={`px-4 py-3 space-y-2 ${
                  c.status === "不通・未対応" ? "bg-red-50/40" :
                  c.status === "調整中・仮予約中" ? "bg-yellow-50/40" :
                  c.status === "保留" ? "bg-gray-50/60" : ""
                }`}>
                  {/* 行1: 顧客名 + ステータス + 削除 */}
                  {c.inherited && (
                    <div className="flex">
                      <span className="flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200">
                        ↩ 前日から引き継ぎ
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={c.name}
                      onChange={e => updateCustomer(c.id, "name", e.target.value)}
                      placeholder="顧客名を入力"
                      className="flex-1 min-w-[120px] text-sm font-medium text-gray-800 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white placeholder-gray-300"
                    />
                    <select
                      value={c.status}
                      onChange={e => updateCustomer(c.id, "status", e.target.value)}
                      className={`text-xs px-2 py-1.5 rounded-md border font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 ${STATUS_STYLE[c.status]}`}
                    >
                      {CUSTOMER_STATUSES_ALL.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => deleteCustomer(c.id)}
                      className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1 ml-auto"
                      title="削除"
                    >✕</button>
                  </div>
                  {/* 行2: やりとり + メモ */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <select
                      value={c.contact}
                      onChange={e => updateCustomer(c.id, "contact", e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 shrink-0"
                    >
                      <option value="">やり取りを選択</option>
                      {CONTACT_OPTIONS.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={c.memo}
                      onChange={e => updateCustomer(c.id, "memo", e.target.value)}
                      placeholder="メモを入力…"
                      className="flex-1 min-w-[160px] text-sm text-gray-700 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white placeholder-gray-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* MISOCA作成完了ステータス */}
        {(() => {
          const today = todayKey();
          const until = misoca.completedUntil;
          const isSet = !!until;
          const isUpToDate = isSet && until >= today;
          const daysLeft = isSet ? Math.round((keyToDate(until).getTime() - keyToDate(today).getTime()) / 86400000) : 0;
          return (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 border-l-emerald-400">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-gray-700">MISOCA見積書作成完了ステータス</span>
                </div>
                {isSet && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    isUpToDate ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                  }`}>
                    {isUpToDate
                      ? daysLeft === 0 ? "本日分まで作成済み" : `あと${daysLeft}日分まで作成済み`
                      : `${Math.abs(daysLeft)}日前で止まっています`
                    }
                  </span>
                )}
              </div>
              <div className="px-4 pb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 whitespace-nowrap">見積書作成済み日まで：</label>
                    <input
                      type="date"
                      value={misoca.completedUntil}
                      onChange={e => setMisoca({ completedUntil: e.target.value })}
                      className="text-sm px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                  {isSet && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      isUpToDate ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {isUpToDate
                          ? `${keyToDate(until).getFullYear()}年${keyToDate(until).getMonth()+1}月${keyToDate(until).getDate()}日までMISOCAで見積書作成済み`
                          : `${keyToDate(until).getFullYear()}年${keyToDate(until).getMonth()+1}月${keyToDate(until).getDate()}日以降の見積書が未作成です`
                        }
                      </span>
                    </div>
                  )}
                  {isSet && (
                    <button
                      onClick={() => setMisoca({ completedUntil: "" })}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      リセット
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })()}

        {categories.map(cat => {
          const catTasks  = tasks.filter(t => t.category === cat);
          const catDone   = catTasks.filter(t => t.done).length;
          const cfg       = CAT_CONFIG[cat] ?? { border: "border-gray-300", badge: "bg-gray-100 text-gray-600", icon: <ClipboardList className="w-4 h-4" /> };

          return (
            <section key={cat} className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 ${cfg.border}`}>

              {/* Category header */}
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    {cfg.icon}
                    {cat}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {catDone < catTasks.length && (
                    <button
                      onClick={() => {
                        setUndoHistory(prev => [tasks, ...prev.slice(0, 9)]);
                        setTasks(prev => prev.map(t => t.category === cat ? { ...t, done: true } : t));
                      }}
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 hover:bg-green-100 text-gray-500 hover:text-green-700 transition-colors"
                    >
                      一括完了
                    </button>
                  )}
                  <span className="text-xs text-gray-400 tabular-nums">
                    {catDone === catTasks.length
                      ? <span className="text-green-500 font-semibold">✓ 完了</span>
                      : <>{catDone} / {catTasks.length}</>
                    }
                  </span>
                </div>
              </div>

              {/* Task rows */}
              <div className="divide-y divide-gray-100">
                {hideDone && catTasks.every(t => t.done) && (
                  <div className="px-4 py-3 text-xs text-green-600 font-medium flex items-center gap-1.5">
                    <span>✓</span><span>このカテゴリはすべて完了しています</span>
                  </div>
                )}
                {catTasks.filter(task => !(hideDone && task.done)).map(task => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-all ${
                      task.done
                        ? "bg-gray-50"
                        : task.help
                          ? "bg-red-50 border-l-4 border-red-400"
                          : task.deadline
                            ? "bg-amber-50 border-l-4 border-amber-400"
                            : "hover:bg-gray-50/60"
                    }`}
                  >
                    {/* Done checkbox */}
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleDone(task.id)}
                      className="w-4 h-4 rounded accent-blue-500 cursor-pointer shrink-0"
                      title="完了"
                    />

                    {/* HELP checkbox */}
                    <label
                      className={`flex items-center gap-0.5 cursor-pointer shrink-0 select-none ${
                        task.done ? "opacity-30 pointer-events-none" : ""
                      }`}
                      title="ヘルプが必要"
                    >
                      <input
                        type="checkbox"
                        checked={task.help}
                        onChange={() => toggleHelp(task.id)}
                        className="sr-only"
                      />
                      <span
                        className={`inline-flex items-center justify-center w-12 h-5 rounded text-[10px] font-bold tracking-wider border transition-all ${
                          task.help
                            ? "bg-red-500 border-red-500 text-white shadow-sm"
                            : "bg-white border-gray-300 text-gray-400 hover:border-red-300 hover:text-red-400"
                        }`}
                      >
                        HELP
                      </span>
                    </label>

                    {/* Icon */}
                    <span className={`shrink-0 ${task.done ? "text-gray-300" : getIconColor(task.id)}`}>
                      {task.icon}
                    </span>

                    {/* Label */}
                    <span className={`flex-1 text-sm leading-snug min-w-0 font-medium ${
                      task.done
                        ? "text-gray-400 line-through font-normal"
                        : task.help
                          ? "text-red-700"
                          : task.deadline
                            ? "text-amber-900"
                            : "text-gray-700 font-normal"
                    }`}>
                      {task.label}
                      {task.deadline && !task.done && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                          ⏰ {task.deadline}
                        </span>
                      )}
                    </span>

                    {/* Planned */}
                    <div className="shrink-0 flex flex-col items-start gap-0.5">
                      <span className="text-[10px] text-gray-400 font-medium leading-none">作業予定者</span>
                      <select
                        value={task.planned}
                        onChange={e => updateTask(task.id, "planned", e.target.value)}
                        disabled={task.done}
                        className={`w-32 rounded-md border text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
                          task.done
                            ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                            : task.planned === "当日事務担当"
                              ? "border-blue-200 bg-blue-50 text-blue-700 font-medium"
                              : task.planned === "当日現場責任者"
                                ? "border-amber-300 bg-amber-50 text-amber-800 font-medium"
                                : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        {PLANNED_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-center text-xs text-gray-400 pb-6">
          入力内容はブラウザに自動保存されます。日付ごとにデータが保存されます。
        </p>
      </main>
    </div>
  );
}

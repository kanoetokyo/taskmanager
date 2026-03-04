/**
 * タスク管理アプリ - メインページ
 * Design: Structured Utility (Refined)
 * - タスクごとにlucide-reactアイコンを表示
 * - 白背景・グレー区切り線のクリーンなレイアウト
 * - カテゴリカードにカラーアクセント左ボーダー
 * - 作業予定者（デフォルト：当日事務担当）・実施者プルダウン
 * - 完了チェックボックス・進捗バー
 * - 前日・翌日ナビゲーション（日付ごとにDB保存）
 * - マルチデバイスリアルタイム同期（tRPC + DB）
 */

import { useState, useEffect, useCallback, useRef } from "react";
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
  Zap,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Individual Handover ────────────────────────────────────────────────────

interface IndividualHandoverTask {
  id: string;
  text: string;
  done: boolean;
  deadline?: string; // 期限（YYYY-MM-DDThh:mm形式）
}

interface IndividualHandoverRecord {
  id: string;
  author: string;       // 作成者
  target: string;       // 対象者
  tasks: IndividualHandoverTask[]; // 引き継ぎ項目（1つ以上）
  inherited?: boolean;
}

function newIndividualTask(): IndividualHandoverTask {
  return { id: crypto.randomUUID(), text: "", done: false, deadline: "" };
}

function newIndividualHandoverRecord(): IndividualHandoverRecord {
  return { id: crypto.randomUUID(), author: "", target: "", tasks: [newIndividualTask()] };
}

// ─── MISOCA ───────────────────────────────────────────────────────────────────

const PLANNED_MEMBERS = ["当日事務担当", "当日現場責任者", "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "四藤", "ウララ", "森山", "勅使河原", "その他"];

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

// ─── Store Check (LINE / POS / Raccoon) ─────────────────────────────────────

const STORE_NAMES = ["大井町", "大森南", "天満", "戸越銀座駅前", "大田中央", "川崎新町", "幸塚越"];

interface StoreCheckState {
  line: string[];   // チェック済み店舗名
  pos: string[];
  raccoon: string[];
}

// ─── Task Definitions ────────────────────────────────────────────────────────

const iconSize = "w-4 h-4 shrink-0";

const BASE_TASKS: TaskDef[] = [
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
  "各種システムのチェック":         { border: "border-slate-300", badge: "bg-slate-100 text-slate-600", icon: <Tablet className="w-4 h-4" /> },
  "顧客対応と事務作業":             { border: "border-slate-300", badge: "bg-slate-100 text-slate-600", icon: <Phone className="w-4 h-4" /> },
  "決済確認":                       { border: "border-slate-300", badge: "bg-slate-100 text-slate-600", icon: <CreditCard className="w-4 h-4" /> },
  "LINEグループ管理":               { border: "border-slate-300", badge: "bg-slate-100 text-slate-600", icon: <MessageCircle className="w-4 h-4" /> },
  "アットイン清掃管理システム確認": { border: "border-slate-300", badge: "bg-slate-100 text-slate-600", icon: <ClipboardList className="w-4 h-4" /> },
  "調整および書類作成":             { border: "border-slate-300", badge: "bg-slate-100 text-slate-600", icon: <FileText className="w-4 h-4" /> },
  "大森事務でのTODO":             { border: "border-slate-300", badge: "bg-slate-100 text-slate-600", icon: <ClipboardList className="w-4 h-4" /> },
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

// ─── Handover Memo ──────────────────────────────────────────────────────────

const HANDOVER_MEMBERS = ["前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "四藤", "ウララ", "森山", "勅使河原"];

interface HandoverItem {
  id: string;
  author: string;   // 作成者
  text: string;
  checked: string[]; // 確認済みメンバー名
  noConfirmationRequired: boolean; // 確認不要フラグ
  inherited?: boolean; // 前日から引き継ぎされたか
}

function newHandoverItem(): HandoverItem {
  return { id: crypto.randomUUID(), author: "", text: "", checked: [], noConfirmationRequired: false };
}

// ─── Customer Handover ─────────────────────────────────────────────────────

const CUSTOMER_STATUSES = ["不通・未対応", "調整中・仮予約中", "保留"] as const;
const CUSTOMER_STATUSES_ALL = [...CUSTOMER_STATUSES, "完了"] as const;
type CustomerStatus = typeof CUSTOMER_STATUSES_ALL[number];

const STORE_NAMES_FULL = ["大井町店", "大森南店", "天満店", "戸越銀座駅前店", "大田中央店", "川崎新町店", "幸塚越店"];
const CONTACT_OPTIONS = [
  "作業時追加",
  ...STORE_NAMES_FULL.map(s => `POS(${s})`),
  ...STORE_NAMES_FULL.map(s => `ラクーン(${s})`),
  ...STORE_NAMES_FULL.map(s => `LINE(${s})`),
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

function newCustomerRecord(): CustomerRecord {
  return { id: crypto.randomUUID(), name: "", status: "不通・未対応", contact: "", memo: "" };
}

// ─── MISOCA Status ───────────────────────────────────────────────────────────

interface MisocaStatus {
  completedUntil: string; // YYYY-MM-DD 形式。この日付まで見積書作成済み
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const utils = trpc.useUtils();

  const [currentDateKey, setCurrentDateKey] = useState<string>(() => todayKey());
  const [tasks, setTasks] = useState<Task[]>(() => makeInitialTasks());
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState<boolean>(false);
  const [showPrevUndone, setShowPrevUndone] = useState<boolean>(false);
  const [handoverItems, setHandoverItems] = useState<HandoverItem[]>([newHandoverItem()]);
  const [undoHistory, setUndoHistory] = useState<Task[][]>([]);
  const [completingTasks, setCompletingTasks] = useState<Set<string>>(new Set());
  const [completedCategories, setCompletedCategories] = useState<Set<string>>(new Set());
  const [flashCategories, setFlashCategories] = useState<Set<string>>(new Set());
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [misoca, setMisoca] = useState<MisocaStatus>({ completedUntil: "" });
  const [handoverOpen, setHandoverOpen] = useState<boolean>(false);
  const [customerOpen, setCustomerOpen] = useState<boolean>(false);
  const [individualHandoverOpen, setIndividualHandoverOpen] = useState<boolean>(false);
  const [storeCheck, setStoreCheck] = useState<StoreCheckState>({ line: [], pos: [], raccoon: [] });
  const [individualHandovers, setIndividualHandovers] = useState<IndividualHandoverRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [prevDayTasks, setPrevDayTasks] = useState<Task[]>([]);

  // ─── tRPC Queries ─────────────────────────────────────────────────────────

  // Task states for current date
  const { data: taskStatesData, refetch: refetchTaskStates } = trpc.task.taskStates.getByDate.useQuery(
    { dateKey: currentDateKey },
    { refetchInterval: 30000 } // 30秒ごとにポーリング
  );

  // Store check for current date
  const { data: storeCheckData, refetch: refetchStoreCheck } = trpc.task.storeCheck.getByDate.useQuery(
    { dateKey: currentDateKey },
    { refetchInterval: 30000 }
  );

  // Handover items for current date
  const { data: handoverData, refetch: refetchHandover } = trpc.task.handover.getByDate.useQuery(
    { dateKey: currentDateKey },
    { refetchInterval: 30000 }
  );

  // Individual handovers (active = not completed)
  const { data: individualHandoverData, refetch: refetchIndividualHandover } = trpc.task.individualHandover.getActive.useQuery(
    { dateKey: currentDateKey },
    { refetchInterval: 30000 }
  );

  // Customer handovers (active)
  const { data: customerData, refetch: refetchCustomer } = trpc.task.customerHandover.getActive.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  // MISOCA status
  const { data: misocaData, refetch: refetchMisoca } = trpc.task.misoca.get.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );

  // Task states for previous day (for undone alert)
  const prevDayKey = (() => { const d = keyToDate(currentDateKey); d.setDate(d.getDate() - 1); return dateToKey(d); })();
  const { data: prevDayTaskStatesData } = trpc.task.taskStates.getByDate.useQuery(
    { dateKey: prevDayKey },
    { refetchInterval: 60000 }
  );

  // ─── tRPC Mutations ───────────────────────────────────────────────────────

  const upsertTaskState = trpc.task.taskStates.upsert.useMutation();
  const bulkUpsertTaskStates = trpc.task.taskStates.bulkUpsert.useMutation();
  const upsertStoreCheck = trpc.task.storeCheck.upsert.useMutation();
  const upsertHandover = trpc.task.handover.upsert.useMutation();
  const deleteHandover = trpc.task.handover.delete.useMutation();
  const upsertIndividualHandover = trpc.task.individualHandover.upsert.useMutation();
  const deleteIndividualHandover = trpc.task.individualHandover.delete.useMutation();
  const upsertCustomer = trpc.task.customerHandover.upsert.useMutation();
  const deleteCustomer = trpc.task.customerHandover.delete.useMutation();
  const upsertMisoca = trpc.task.misoca.upsert.useMutation();

  // ─── Data Loading from DB ─────────────────────────────────────────────────

  // Load task states from DB
  useEffect(() => {
    if (taskStatesData) {
      setTasks(prev => {
        return BASE_TASKS.map(t => {
          const dbState = taskStatesData.find(s => s.taskId === t.id);
          const existing = prev.find(p => p.id === t.id);
          return {
            ...t,
            planned: existing?.planned ?? (t.defaultPlanned ?? "当日事務担当"),
            actual: existing?.actual ?? "",
            done: dbState?.done ?? false,
            help: existing?.help ?? false,
          };
        });
      });
    }
  }, [taskStatesData]);

  // Load store check from DB
  useEffect(() => {
    if (storeCheckData) {
      const newState: StoreCheckState = { line: [], pos: [], raccoon: [] };
      for (const row of storeCheckData) {
        if (row.checkType === "line") newState.line = row.checkedStores as string[];
        else if (row.checkType === "pos") newState.pos = row.checkedStores as string[];
        else if (row.checkType === "raccoon") newState.raccoon = row.checkedStores as string[];
      }
      setStoreCheck(newState);
    }
  }, [storeCheckData]);

  // Load handover items from DB
  useEffect(() => {
    if (handoverData !== undefined) {
      if (handoverData.length > 0) {
        setHandoverItems(handoverData.map(h => ({
          id: h.id,
          author: h.author,
          text: h.content,
          checked: h.checkedMembers as string[],
          noConfirmationRequired: h.noConfirmationRequired ?? false,
        })));
      } else {
        // No data for this date - initialize with empty item
        setHandoverItems([newHandoverItem()]);
      }
    }
  }, [handoverData]);

  // Load individual handovers from DB
  useEffect(() => {
    if (individualHandoverData !== undefined) {
      const records: IndividualHandoverRecord[] = individualHandoverData.map(r => ({
        id: r.id,
        author: r.author,
        target: r.target,
        tasks: (r.tasks as Array<{ id: string; content: string; done: boolean; deadline?: string }>).map(t => ({
          id: t.id,
          text: t.content,
          done: t.done,
          deadline: t.deadline ?? "",
        })),
        inherited: r.dateKey !== currentDateKey,
      }));
      setIndividualHandovers(records);
    }
  }, [individualHandoverData, currentDateKey]);

  // Load customer handovers from DB
  useEffect(() => {
    if (customerData !== undefined) {
      const records: CustomerRecord[] = customerData.map(c => ({
        id: c.id,
        name: c.customerName,
        status: c.status as CustomerStatus,
        contact: c.store,
        memo: c.content,
        inherited: c.dateKey !== currentDateKey,
      }));
      setCustomers(records);
    }
  }, [customerData, currentDateKey]);

  // Load MISOCA status from DB
  useEffect(() => {
    if (misocaData) {
      setMisoca({ completedUntil: misocaData.completedUntil });
    }
  }, [misocaData]);

  // Load prev day tasks for undone alert
  useEffect(() => {
    if (prevDayTaskStatesData !== undefined) {
      const tasks = BASE_TASKS.map(t => {
        const dbState = prevDayTaskStatesData.find(s => s.taskId === t.id);
        return {
          ...t,
          planned: t.defaultPlanned ?? "当日事務担当",
          actual: "",
          done: dbState?.done ?? false,
          help: false,
        };
      });
      setPrevDayTasks(tasks);
    }
  }, [prevDayTaskStatesData]);

  // Reset state when date changes
  useEffect(() => {
    setTasks(makeInitialTasks());
    setHandoverItems([newHandoverItem()]);
    setStoreCheck({ line: [], pos: [], raccoon: [] });
    setLastSaved(null);
    setUndoHistory([]);
    setCompletedCategories(new Set());
  }, [currentDateKey]);

  // ─── Auto-save Debounce Refs ───────────────────────────────────────────────
  const storeCheckSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const individualHandoverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Store Check Auto-save ─────────────────────────────────────────────────
  const storeCheckRef = useRef(storeCheck);
  storeCheckRef.current = storeCheck;
  const currentDateKeyRef = useRef(currentDateKey);
  currentDateKeyRef.current = currentDateKey;

  // mutationオブジェクトへの最新参照をrefで保持（useCallbackのstale closure対策）
  const upsertStoreCheckRef = useRef(upsertStoreCheck);
  upsertStoreCheckRef.current = upsertStoreCheck;
  const upsertHandoverRef = useRef(upsertHandover);
  upsertHandoverRef.current = upsertHandover;
  const upsertIndividualHandoverRef = useRef(upsertIndividualHandover);
  upsertIndividualHandoverRef.current = upsertIndividualHandover;
  const upsertCustomerRef = useRef(upsertCustomer);
  upsertCustomerRef.current = upsertCustomer;
  const bulkUpsertTaskStatesRef = useRef(bulkUpsertTaskStates);
  bulkUpsertTaskStatesRef.current = bulkUpsertTaskStates;

  const saveStoreCheckToDb = useCallback((state: StoreCheckState, dateKey: string) => {
    if (storeCheckSaveTimer.current) clearTimeout(storeCheckSaveTimer.current);
    storeCheckSaveTimer.current = setTimeout(async () => {
      try {
        await Promise.all([
          upsertStoreCheckRef.current.mutateAsync({ dateKey, checkType: "line", checkedStores: state.line }),
          upsertStoreCheckRef.current.mutateAsync({ dateKey, checkType: "pos", checkedStores: state.pos }),
          upsertStoreCheckRef.current.mutateAsync({ dateKey, checkType: "raccoon", checkedStores: state.raccoon }),
        ]);
        const now = new Date();
        setLastSaved(`同期済み ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
      } catch (e) {
        console.error("Store check save failed:", e);
        toast.error("保存に失敗しました。再試行してください。", { id: "save-error", duration: 4000 });
      }
    }, 500);
  }, []);

  // ─── Handover Auto-save ────────────────────────────────────────────────────

  const saveHandoverToDb = useCallback((items: HandoverItem[], dateKey: string) => {
    if (handoverSaveTimer.current) clearTimeout(handoverSaveTimer.current);
    handoverSaveTimer.current = setTimeout(async () => {
      try {
        for (const item of items) {
          await upsertHandoverRef.current.mutateAsync({
            id: item.id,
            dateKey,
            author: item.author,
            content: item.text,
            checkedMembers: item.checked,
            noConfirmationRequired: item.noConfirmationRequired,
          });
        }
        const now = new Date();
        setLastSaved(`同期済み ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
      } catch (e) {
        console.error("Handover save failed:", e);
        toast.error("保存に失敗しました。再試行してください。", { id: "save-error", duration: 4000 });
      }
    }, 800);
  }, []);

  // ─── Individual Handover Auto-save ────────────────────────────────────────

  const saveIndividualHandoverToDb = useCallback((records: IndividualHandoverRecord[], dateKey: string) => {
    if (individualHandoverSaveTimer.current) clearTimeout(individualHandoverSaveTimer.current);
    individualHandoverSaveTimer.current = setTimeout(async () => {
      try {
        for (const record of records) {
          const allDone = record.tasks.length > 0 && record.tasks.every(t => t.done);
          await upsertIndividualHandoverRef.current.mutateAsync({
            id: record.id,
            dateKey: record.inherited ? dateKey : dateKey,
            author: record.author,
            target: record.target,
            tasks: record.tasks.map(t => ({ id: t.id, content: t.text, done: t.done, deadline: t.deadline })),
            completed: allDone,
          });
        }
        const now = new Date();
        setLastSaved(`同期済み ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
      } catch (e) {
        console.error("Individual handover save failed:", e);
        toast.error("保存に失敗しました。再試行してください。", { id: "save-error", duration: 4000 });
      }
    }, 800);
  }, []);

  // ─── Customer Auto-save ────────────────────────────────────────────────────

  const saveCustomerToDb = useCallback((records: CustomerRecord[], dateKey: string) => {
    if (customerSaveTimer.current) clearTimeout(customerSaveTimer.current);
    customerSaveTimer.current = setTimeout(async () => {
      try {
        for (const c of records) {
          await upsertCustomerRef.current.mutateAsync({
            id: c.id,
            dateKey,
            customerName: c.name,
            store: c.contact,
            content: c.memo,
            status: c.status,
            assignee: "",
          });
        }
        const now = new Date();
        setLastSaved(`同期済み ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
      } catch (e) {
        console.error("Customer save failed:", e);
        toast.error("保存に失敗しました。再試行してください。", { id: "save-error", duration: 4000 });
      }
    }, 800);
  }, []);

  // ─── Task State Auto-save ──────────────────────────────────────────────────
  const taskSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTasksToDb = useCallback((taskList: Task[], dateKey: string) => {
    if (taskSaveTimer.current) clearTimeout(taskSaveTimer.current);
    taskSaveTimer.current = setTimeout(async () => {
      try {
        await bulkUpsertTaskStatesRef.current.mutateAsync(
          taskList.map(t => ({ dateKey, taskId: t.id, done: t.done }))
        );
        const now = new Date();
        setLastSaved(`同期済み ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
      } catch (e) {
        console.error("Task save failed:", e);
        toast.error("保存に失敗しました。再試行してください。", { id: "save-error", duration: 4000 });
      }
    }, 800);
  }, []);

  // ─── Customer Handlers ─────────────────────────────────────────────────────

  const addCustomer = () => {
    const newRecord = newCustomerRecord();
    const updated = [...customers, newRecord];
    setCustomers(updated);
    saveCustomerToDb(updated, currentDateKey);
  };

  const updateCustomer = (id: string, field: keyof CustomerRecord, value: string) => {
    const updated = customers.map(c => {
      if (c.id !== id) return c;
      const updatedRecord = { ...c, [field]: value };
      // 完了に変更した場合は1秒後に自動削除
      if (field === "status" && value === "完了") {
        setTimeout(async () => {
          setCustomers(p => p.filter(r => r.id !== id));
          try {
            await deleteCustomer.mutateAsync({ id });
          } catch (e) {
            console.error("Customer delete failed:", e);
          }
          toast.success("顧客引き継ぎを完了として削除しました");
        }, 800);
      }
      return updatedRecord;
    });
    setCustomers(updated);
    saveCustomerToDb(updated, currentDateKey);
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm("この顧客引き継ぎを削除しますか？")) return;
    setCustomers(prev => prev.filter(c => c.id !== id));
    try {
      await deleteCustomer.mutateAsync({ id });
    } catch (e) {
      console.error("Customer delete failed:", e);
    }
  };

  // ─── Handover Handlers ─────────────────────────────────────────────────────

  const addHandoverItem = () => {
    const newItem = newHandoverItem();
    const updated = [...handoverItems, newItem];
    setHandoverItems(updated);
    saveHandoverToDb(updated, currentDateKey);
  };

  const updateHandoverItem = (id: string, field: keyof HandoverItem, value: string | boolean) => {
    const updated = handoverItems.map(item => item.id === id ? { ...item, [field]: value } : item);
    setHandoverItems(updated);
    saveHandoverToDb(updated, currentDateKey);
  };

  const handleDeleteHandoverItem = async (id: string) => {
    setHandoverItems(prev => prev.filter(item => item.id !== id));
    try {
      await deleteHandover.mutateAsync({ id });
    } catch (e) {
      console.error("Handover delete failed:", e);
    }
  };

  const toggleHandoverCheck = (itemId: string, member: string) => {
    const updated = handoverItems.map(item => {
      if (item.id !== itemId) return item;
      const alreadyChecked = item.checked.includes(member);
      const newChecked = alreadyChecked
        ? item.checked.filter((m: string) => m !== member)
        : [...item.checked, member];
      // 全員チェック完了時はそのアイテムを削除
      if (!alreadyChecked && newChecked.length === HANDOVER_MEMBERS.length) {
        setTimeout(async () => {
          setHandoverItems(p => {
            const remaining = p.filter(i => i.id !== itemId);
            if (remaining.length === 0) return [newHandoverItem()];
            return remaining;
          });
          try {
            await deleteHandover.mutateAsync({ id: itemId });
          } catch (e) {
            console.error("Handover delete failed:", e);
          }
          toast.success("全員が確認しました。引き継ぎメモをクリアしました。");
        }, 600);
      }
      return { ...item, checked: newChecked };
    });
    setHandoverItems(updated);
    saveHandoverToDb(updated, currentDateKey);
  };

  // ─── Individual Handover Handlers ─────────────────────────────────────────

  const addIndividualHandover = () => {
    const newRecord = newIndividualHandoverRecord();
    const updated = [...individualHandovers, newRecord];
    setIndividualHandovers(updated);
    saveIndividualHandoverToDb(updated, currentDateKey);
  };

  const handleDeleteIndividualHandover = async (id: string) => {
    if (!confirm("この個別引き継ぎを削除しますか？")) return;
    setIndividualHandovers(prev => prev.filter(r => r.id !== id));
    try {
      await deleteIndividualHandover.mutateAsync({ id });
    } catch (e) {
      console.error("Individual handover delete failed:", e);
    }
  };

  const updateIndividualHandover = (id: string, field: keyof IndividualHandoverRecord, value: string) => {
    const updated = individualHandovers.map(r => r.id === id ? { ...r, [field]: value } : r);
    setIndividualHandovers(updated);
    saveIndividualHandoverToDb(updated, currentDateKey);
  };

  const addIndividualTask = (recordId: string) => {
    const updated = individualHandovers.map(r =>
      r.id === recordId ? { ...r, tasks: [...r.tasks, newIndividualTask()] } : r
    );
    setIndividualHandovers(updated);
    saveIndividualHandoverToDb(updated, currentDateKey);
  };

  const updateIndividualTask = (recordId: string, taskId: string, field: keyof IndividualHandoverTask, value: string | boolean) => {
    const updated = individualHandovers.map(r =>
      r.id === recordId
        ? { ...r, tasks: r.tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t) }
        : r
    );
    // 全項目完了時に1秒後自動削除
    if (field === "done" && value === true) {
      const record = updated.find(r => r.id === recordId);
      if (record && record.tasks.every(t => t.done)) {
        setTimeout(async () => {
          setIndividualHandovers(p => p.filter(r => r.id !== recordId));
          try {
            await deleteIndividualHandover.mutateAsync({ id: recordId });
          } catch (e) {
            console.error("Individual handover delete failed:", e);
          }
          toast.success("✅ 個別引き継ぎを全項目完了しました");
        }, 800);
      }
    }
    setIndividualHandovers(updated);
    saveIndividualHandoverToDb(updated, currentDateKey);
  };

  const deleteIndividualTask = (recordId: string, taskId: string) => {
    const updated = individualHandovers.map(r =>
      r.id === recordId ? { ...r, tasks: r.tasks.filter(t => t.id !== taskId) } : r
    );
    setIndividualHandovers(updated);
    saveIndividualHandoverToDb(updated, currentDateKey);
  };

  // ─── Task Handlers ─────────────────────────────────────────────────────────

  const updateTask = (id: string, field: "planned" | "actual", value: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, [field]: value } : t);
    setTasks(updated);
    saveTasksToDb(updated, currentDateKey);
  };

  const toggleDone = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task && !task.done) {
      // 完了にする場合はアニメーションを先に起動
      setCompletingTasks(prev => new Set(prev).add(id));
      setTimeout(() => {
        const updated = tasks.map(t => t.id === id ? { ...t, done: true } : t);
        setUndoHistory(h => [...h.slice(-9), tasks]);
        setTasks(updated);
        saveTasksToDb(updated, currentDateKey);
        setCompletingTasks(prev => { const s = new Set(prev); s.delete(id); return s; });
      }, 400);
    } else {
      // 完了解除は即座に戻す
      const updated = tasks.map(t => t.id === id ? { ...t, done: false } : t);
      setUndoHistory(h => [...h.slice(-9), tasks]);
      setTasks(updated);
      saveTasksToDb(updated, currentDateKey);
    }
  };

  const undoLast = () => {
    if (undoHistory.length === 0) return;
    const prev = undoHistory[undoHistory.length - 1];
    setTasks(prev);
    saveTasksToDb(prev, currentDateKey);
    setUndoHistory(h => h.slice(0, -1));
    toast.success("元に戻しました");
  };

  const toggleHelp = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, help: !t.help } : t);
    setTasks(updated);
    saveTasksToDb(updated, currentDateKey);
  };

  const markAllPrevDone = async () => {
    try {
      await bulkUpsertTaskStates.mutateAsync(
        BASE_TASKS.map(t => ({ dateKey: prevDayKey, taskId: t.id, done: true }))
      );
      setPrevDayTasks(BASE_TASKS.map(t => ({ ...t, planned: t.defaultPlanned ?? "当日事務担当", actual: "", done: true, help: false })));
      toast.success("前日の未完了タスクをすべて完了にしました");
    } catch (e) {
      toast.error("保存に失敗しました");
    }
  };

  const handleReset = async () => {
    if (!confirm("この日の全設定をリセットしますか？")) return;
    const initial = makeInitialTasks();
    setTasks(initial);
    try {
      await bulkUpsertTaskStates.mutateAsync(
        initial.map(t => ({ dateKey: currentDateKey, taskId: t.id, done: false }))
      );
    } catch (e) {
      console.error("Reset failed:", e);
    }
    setLastSaved(null);
    toast.info("リセットしました");
  };

  // ─── Store Check Handlers ──────────────────────────────────────────────────

  const toggleStoreCheck = (type: keyof StoreCheckState, store: string) => {
    setStoreCheck(prev => {
      const checked = prev[type].includes(store);
      const updated = {
        ...prev,
        [type]: checked ? prev[type].filter(s => s !== store) : [...prev[type], store],
      };
      saveStoreCheckToDb(updated, currentDateKey);
      return updated;
    });
  };

  // ─── MISOCA Handler ────────────────────────────────────────────────────────

  const updateMisoca = async (completedUntil: string) => {
    setMisoca({ completedUntil });
    try {
      await upsertMisoca.mutateAsync({ completedUntil });
    } catch (e) {
      console.error("MISOCA save failed:", e);
    }
  };

  // ─── Manual Sync ──────────────────────────────────────────────────────────

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await Promise.all([
        refetchTaskStates(),
        refetchStoreCheck(),
        refetchHandover(),
        refetchIndividualHandover(),
        refetchCustomer(),
        refetchMisoca(),
      ]);
      toast.success("最新データに同期しました");
    } catch (e) {
      toast.error("同期に失敗しました");
    } finally {
      setIsSyncing(false);
    }
  };

  // ─── Category completion detection ────────────────────────────────────────

  const categories = Array.from(new Set(BASE_TASKS.map(t => t.category)));
  useEffect(() => {
    categories.forEach(cat => {
      const catTasks = tasks.filter(t => t.category === cat);
      const allDone = catTasks.length > 0 && catTasks.every(t => t.done);
      const wasComplete = completedCategories.has(cat);
      if (allDone && !wasComplete) {
        setCompletedCategories(prev => new Set(prev).add(cat));
        toast.success(`✨ ${cat}—全タスク完了！`, { duration: 2500 });
        setFlashCategories(prev => new Set(prev).add(cat));
        setTimeout(() => {
          setFlashCategories(prev => { const s = new Set(prev); s.delete(cat); return s; });
        }, 800);
      } else if (!allDone && wasComplete) {
        setCompletedCategories(prev => { const s = new Set(prev); s.delete(cat); return s; });
      }
    });
  }, [tasks]);

  // ─── Navigation ───────────────────────────────────────────────────────────

  const goToPrevDay = useCallback(() => {
    const d = keyToDate(currentDateKey); d.setDate(d.getDate() - 1);
    setCurrentDateKey(dateToKey(d));
  }, [currentDateKey]);

  const goToNextDay = useCallback(() => {
    const d = keyToDate(currentDateKey); d.setDate(d.getDate() + 1);
    setCurrentDateKey(dateToKey(d));
  }, [currentDateKey]);

  const goToToday = useCallback(() => setCurrentDateKey(todayKey()), []);

  // ─── Derived State ────────────────────────────────────────────────────────

  const isToday = currentDateKey === todayKey();
  const totalTasks = tasks.length;
  const doneTasks  = tasks.filter(t => t.done).length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const { main: dateMain, sub: dateSub } = formatDateLabel(currentDateKey);

  const prevDayUndoneTasks = prevDayTasks.filter(t => !t.done);
  const { main: prevDateMain } = formatDateLabel(prevDayKey);

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-10" style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-2">

          {/* Row 1: アイコン + タイトル（常に1行で表示） */}
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#2563eb" }}>
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-bold text-gray-900" style={{ letterSpacing: "0.03em" }}>
              タスク革命
            </h1>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="ml-2 p-1 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              title="最新データに同期"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-blue-500" : ""}`} />
            </button>
          </div>

          {/* Row 2: 日付ナビ */}
          <div className="mt-2 flex items-center justify-center gap-1">
            <button onClick={goToPrevDay} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors" title="前日">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">{dateMain}</span>
              {dateSub && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">{dateSub}</span>
              )}
            </div>
            <button onClick={goToNextDay} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors" title="翌日">
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isToday && (
              <button onClick={goToToday} className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium">
                今日
              </button>
            )}
          </div>

          {/* Row 3: 進捗バー */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: progressPct === 100 ? "#16a34a" : "#2563eb" }}
              />
            </div>
            <span className="text-xs font-semibold text-blue-600 whitespace-nowrap tabular-nums">
              {progressPct}%
            </span>
            <span className="text-xs text-gray-400 whitespace-nowrap tabular-nums">
              {doneTasks} / {totalTasks}
            </span>
          </div>

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
        <section className="bg-white border border-gray-200 border-l-4 border-l-slate-300 rounded-xl shadow-sm overflow-hidden">
          {/* ヘッダー（アコーディオン） */}
          <div
            className="px-4 py-2.5 flex items-center gap-2 cursor-pointer select-none hover:bg-gray-50 transition-colors"
            onClick={() => setHandoverOpen(v => !v)}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
              <ClipboardList className="w-4 h-4" />
              全体引き継ぎ
            </span>
            {!handoverOpen && handoverItems.some(i => i.text) && (
              <span className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full font-medium">
                {handoverItems.filter(i => i.text).length}件
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {handoverOpen && (
                <button
                  onClick={e => { e.stopPropagation(); addHandoverItem(); }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-yellow-300 text-yellow-700 hover:bg-yellow-50 transition-colors font-medium"
                >
                  <span className="text-base leading-none">+</span> メモを追加
                </button>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${handoverOpen ? "rotate-180" : ""}`} />
            </div>
          </div>

          {/* 各メモ（アコーディオン本体） */}
          {handoverOpen && (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {handoverItems.map((item, idx) => {
              return (<div key={item.id} className="px-4 py-3 space-y-2">
                {/* 作成者選択 + 確認不要トグル + 削除ボタン */}
                <div className="flex items-center gap-2 flex-wrap">
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
                  {/* 確認不要トグル */}
                  <button
                    onClick={() => updateHandoverItem(item.id, "noConfirmationRequired", !item.noConfirmationRequired)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                      item.noConfirmationRequired
                        ? "bg-gray-500 border-gray-500 text-white shadow-sm"
                        : "bg-white border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600"
                    }`}
                    title={item.noConfirmationRequired ? "確認不要（クリックで解除）" : "確認不要にする"}
                  >
                    {item.noConfirmationRequired ? "✓ 確認不要" : "確認不要"}
                  </button>
                  {/* 削除ボタン（常に表示） */}
                  <button
                    onClick={() => handleDeleteHandoverItem(item.id)}
                    className="ml-auto text-xs text-gray-300 hover:text-red-400 transition-colors px-1"
                    title="このメモを削除"
                  >
                    ✕
                  </button>
                </div>

                {/* テキスト入力 */}
                <textarea
                  value={item.text}
                  onChange={e => {
                    updateHandoverItem(item.id, "text", e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  onFocus={e => {
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  placeholder="引き継ぎ事項を入力してください…"
                  rows={2}
                  className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-yellow-400 placeholder-gray-300"
                  style={{ minHeight: "60px" }}
                />

                {/* 全員確認チェック（テキストがあるかつ確認不要でないときのみ） */}
                {item.text && !item.noConfirmationRequired && (
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
              </div>);
            })}
          </div>
          )}
        </section>

        {/* 個別引き継ぎパネル */}
        <section className="bg-white border border-gray-200 border-l-4 border-l-slate-300 rounded-xl shadow-sm overflow-hidden">
          {/* ヘッダー（アコーディオン） */}
          <div
            className="px-4 py-2.5 flex items-center gap-2 cursor-pointer select-none hover:bg-gray-50 transition-colors"
            onClick={() => setIndividualHandoverOpen(v => !v)}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
              <Send className="w-4 h-4" />
              個別引き継ぎ
            </span>
            {!individualHandoverOpen && individualHandovers.length > 0 && (
              <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                {individualHandovers.length}件
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {individualHandoverOpen && (
                <button
                  onClick={e => { e.stopPropagation(); addIndividualHandover(); }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors font-medium"
                >
                  <span className="text-base leading-none">+</span> 引き継ぎを追加
                </button>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${individualHandoverOpen ? "rotate-180" : ""}`} />
            </div>
          </div>

          {/* 個別引き継ぎ一覧（アコーディオン本体） */}
          {individualHandoverOpen && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {individualHandovers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                「引き継ぎを追加」ボタンで個別引き継ぎを作成できます
              </div>
            ) : (
              individualHandovers.map(record => (
                <div key={record.id} className="px-4 py-3 space-y-3">
                  {/* 前日引き継ぎバッジ */}
                  {record.inherited && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200">
                      ↩ 前日から引き継ぎ
                    </span>
                  )}
                  {/* 作成者・対象者行 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={record.author}
                      onChange={e => updateIndividualHandover(record.id, "author", e.target.value)}
                      className={`text-xs px-2 py-1.5 rounded-md border focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                        record.author ? "border-purple-300 text-purple-800 bg-purple-50" : "border-gray-200 text-gray-400 bg-gray-50"
                      }`}
                    >
                      <option value="">作成者を選択</option>
                      {HANDOVER_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span className="text-xs text-gray-400">→</span>
                    <select
                      value={record.target}
                      onChange={e => updateIndividualHandover(record.id, "target", e.target.value)}
                      className={`text-xs px-2 py-1.5 rounded-md border focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                        record.target ? "border-purple-300 text-purple-800 bg-purple-50" : "border-gray-200 text-gray-400 bg-gray-50"
                      }`}
                    >
                      <option value="">対象者を選択</option>
                      {HANDOVER_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button
                      onClick={() => handleDeleteIndividualHandover(record.id)}
                      className="ml-auto text-xs text-gray-300 hover:text-red-400 transition-colors px-1"
                      title="この引き継ぎを削除"
                    >✕</button>
                  </div>
                  {/* 引き継ぎ項目一覧 */}
                  <div className="space-y-2">
                    {record.tasks.map((task, tIdx) => (
                      <div key={task.id} className="flex items-start gap-2">
                        <button
                          onClick={() => updateIndividualTask(record.id, task.id, "done", !task.done)}
                          className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            task.done
                              ? "bg-green-500 border-green-500 text-white"
                              : "border-gray-300 hover:border-purple-400"
                          }`}
                        >
                          {task.done && <span className="text-xs font-bold">✓</span>}
                        </button>
                        <div className="flex-1 space-y-1">
                          <textarea
                            value={task.text}
                            onChange={e => {
                              updateIndividualTask(record.id, task.id, "text", e.target.value);
                              e.target.style.height = "auto";
                              e.target.style.height = e.target.scrollHeight + "px";
                            }}
                            onFocus={e => {
                              e.target.style.height = "auto";
                              e.target.style.height = e.target.scrollHeight + "px";
                            }}
                            placeholder={`引き継ぎ内容 ${tIdx + 1}を入力…`}
                            rows={1}
                            className={`w-full text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none overflow-hidden placeholder-gray-300 ${
                              task.done
                                ? "line-through text-gray-400 bg-gray-50 border-gray-200"
                                : "text-gray-800 bg-white border-gray-200"
                            }`}
                            style={{ minHeight: "34px" }}
                          />
                          {/* 期限入力 */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">期限:</span>
                            <input
                              type="datetime-local"
                              value={task.deadline || ""}
                              onChange={e => updateIndividualTask(record.id, task.id, "deadline", e.target.value)}
                              className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                                task.deadline && !task.done
                                  ? new Date(task.deadline) < new Date()
                                    ? "border-red-300 text-red-600 bg-red-50"
                                    : "border-purple-200 text-purple-700 bg-purple-50"
                                  : "border-gray-200 text-gray-500 bg-gray-50"
                              }`}
                            />
                            {task.deadline && (
                              <button
                                onClick={() => updateIndividualTask(record.id, task.id, "deadline", "")}
                                className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                                title="期限をクリア"
                              >×</button>
                            )}
                          </div>
                        </div>
                        {record.tasks.length > 1 && (
                          <button
                            onClick={() => deleteIndividualTask(record.id, task.id)}
                            className="mt-1 text-xs text-gray-300 hover:text-red-400 transition-colors shrink-0"
                            title="この項目を削除"
                          >✕</button>
                        )}
                      </div>
                    ))}
                    {/* 項目追加ボタン */}
                    <button
                      onClick={() => addIndividualTask(record.id)}
                      className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition-colors font-medium mt-1"
                    >
                      <span className="text-base leading-none">+</span> 項目を追加
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          )}
        </section>

        {/* 顧客引き継ぎダッシュボード */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 border-l-slate-300">
          {/* ヘッダー（アコーディオン） */}
          <div
            className="px-4 py-2.5 flex items-center gap-2 cursor-pointer select-none hover:bg-gray-50 transition-colors"
            onClick={() => setCustomerOpen(v => !v)}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              <Users className="w-4 h-4" />
              顧客引き継ぎ
            </span>
            {!customerOpen && customers.length > 0 && (
              <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                {customers.length}件
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {customerOpen && (
                <button
                  onClick={e => { e.stopPropagation(); addCustomer(); }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors shadow-sm"
                >
                  <span className="text-base leading-none">+</span> 顧客を追加
                </button>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${customerOpen ? "rotate-180" : ""}`} />
            </div>
          </div>

          {/* 顧客一覧（アコーディオン本体） */}
          {customerOpen && (
          <div className="border-t border-gray-100">
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
                      onClick={() => handleDeleteCustomer(c.id)}
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
                    <textarea
                      value={c.memo}
                      onChange={e => {
                        updateCustomer(c.id, "memo", e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.scrollHeight + "px";
                      }}
                      onFocus={e => {
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.scrollHeight + "px";
                      }}
                      placeholder="メモを入力…"
                      rows={1}
                      className="flex-1 min-w-[160px] text-sm text-gray-700 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white placeholder-gray-300 resize-none overflow-hidden"
                      style={{ minHeight: "34px" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            )}
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
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 border-l-slate-300">
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
                      onChange={e => updateMisoca(e.target.value)}
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
                      onClick={() => updateMisoca("")}
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
            <section
              key={cat}
              className={`rounded-xl border overflow-hidden transition-all duration-300 ${
                flashCategories.has(cat)
                  ? "bg-green-50 border-green-300"
                  : "bg-white border-gray-200"
              }`}
              style={{ boxShadow: flashCategories.has(cat) ? "0 0 0 2px #86efac" : "0 1px 3px rgba(0,0,0,0.06)" }}
            >

              {/* Category header */}
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #f3f4f6" }}>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 shrink-0">{cfg.icon}</span>
                  <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">{cat}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{catTasks.length} TASKS</span>
                </div>
                <div className="flex items-center gap-2">
                  {catDone < catTasks.length && (
                    <button
                      onClick={() => {
                        setUndoHistory(prev => [tasks, ...prev.slice(0, 9)]);
                        const updated = tasks.map(t => t.category === cat ? { ...t, done: true } : t);
                        setTasks(updated);
                        saveTasksToDb(updated, currentDateKey);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium transition-colors"
                    >
                      一括完了
                    </button>
                  )}
                  <span className="text-xs tabular-nums">
                    {catDone === catTasks.length
                      ? <span className="text-green-500 font-semibold">✓ 完了</span>
                      : <span className="text-gray-400">{catDone} / {catTasks.length}</span>
                    }
                  </span>
                </div>
              </div>

              {/* 各種システムのチェックカテゴリの場合、店舗ボタン形式を先頭に表示 */}
              {cat === "各種システムのチェック" && (
                <div className="divide-y divide-gray-50">
                  {/* 公式LINE */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-green-500 shrink-0"><MessageCircle className="w-4 h-4" /></span>
                      <span className="text-sm text-gray-700 font-medium flex-1">公式LINEの要対応チェック（前日１８：００以降）</span>
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium shrink-0">12:00まで</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {STORE_NAMES.map(store => {
                        const checked = storeCheck.line.includes(store);
                        return (
                          <button
                            key={store}
                            onClick={() => toggleStoreCheck("line", store)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                              checked
                                ? "bg-green-500 border-green-500 text-white shadow-sm"
                                : "bg-white border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-700"
                            }`}
                          >
                            {checked ? "✓ " : ""}{store}
                          </button>
                        );
                      })}
                      <span className="self-center text-xs text-gray-400 ml-1">
                        {storeCheck.line.length === STORE_NAMES.length
                          ? <span className="text-green-500 font-semibold">✓ 全店舗完了</span>
                          : `${storeCheck.line.length}/${STORE_NAMES.length}店舗`
                        }
                      </span>
                    </div>
                  </div>
                  {/* POS */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-500 shrink-0"><Tablet className="w-4 h-4" /></span>
                      <span className="text-sm text-gray-700 font-medium flex-1">POSのチェック</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {STORE_NAMES.map(store => {
                        const checked = storeCheck.pos.includes(store);
                        return (
                          <button
                            key={store}
                            onClick={() => toggleStoreCheck("pos", store)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                              checked
                                ? "bg-green-500 border-green-500 text-white shadow-sm"
                                : "bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-700"
                            }`}
                          >
                            {checked ? "✓ " : ""}{store}
                          </button>
                        );
                      })}
                      <span className="self-center text-xs text-gray-400 ml-1">
                        {storeCheck.pos.length === STORE_NAMES.length
                          ? <span className="text-green-500 font-semibold">✓ 全店舗完了</span>
                          : `${storeCheck.pos.length}/${STORE_NAMES.length}店舗`
                        }
                      </span>
                    </div>
                  </div>
                  {/* ラクーン */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-500 shrink-0"><Package className="w-4 h-4" /></span>
                      <span className="text-sm text-gray-700 font-medium flex-1">ラクーンのチェック</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {STORE_NAMES.map(store => {
                        const checked = storeCheck.raccoon.includes(store);
                        return (
                          <button
                            key={store}
                            onClick={() => toggleStoreCheck("raccoon", store)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                              checked
                                ? "bg-green-500 border-green-500 text-white shadow-sm"
                                : "bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-700"
                            }`}
                          >
                            {checked ? "✓ " : ""}{store}
                          </button>
                        );
                      })}
                      <span className="self-center text-xs text-gray-400 ml-1">
                        {storeCheck.raccoon.length === STORE_NAMES.length
                          ? <span className="text-green-500 font-semibold">✓ 全店舗完了</span>
                          : `${storeCheck.raccoon.length}/${STORE_NAMES.length}店舗`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Task rows */}
              <div className="divide-y divide-gray-50">
                {hideDone && catTasks.every(t => t.done) && (
                  <div className="px-4 py-3 text-xs text-green-600 font-medium flex items-center gap-1.5">
                    <span>✓</span><span>このカテゴリはすべて完了しています</span>
                  </div>
                )}
                {catTasks.filter(task => !(hideDone && task.done)).map(task => (
                  <div
                    key={task.id}
                    className={`px-4 py-3 transition-all duration-300 ${
                      completingTasks.has(task.id)
                        ? "opacity-0 scale-95 pointer-events-none"
                        : task.done
                          ? "opacity-60 bg-gray-50/60"
                          : task.help
                            ? "bg-red-50"
                            : task.deadline
                              ? "bg-amber-50/50"
                              : "hover:bg-gray-50/80"
                    }`}
                    style={{ transform: completingTasks.has(task.id) ? "translateX(8px)" : undefined }}
                  >
                    {/* Row 1: checkbox + HELP + icon + label */}
                    <div className="flex items-center gap-2.5">
                      {/* Done checkbox */}
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => toggleDone(task.id)}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0"
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
                          className={`inline-flex items-center justify-center w-10 h-5 rounded text-[10px] font-bold tracking-wider border transition-all ${
                            task.help
                              ? "bg-red-500 border-red-500 text-white"
                              : "bg-white border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-400"
                          }`}
                        >
                          HELP
                        </span>
                      </label>

                      {/* Icon */}
                      <span className={`shrink-0 ${ task.done ? "text-gray-300" : getIconColor(task.id)}`}>
                        {task.icon}
                      </span>

                      {/* Label */}
                      <span className={`flex-1 text-sm leading-snug min-w-0 ${
                        task.done
                          ? "text-gray-400 line-through"
                          : task.help
                            ? "text-red-700 font-medium"
                            : task.deadline
                              ? "text-amber-900"
                              : "text-gray-700"
                      }`}>
                        {task.label}
                        {task.deadline && !task.done && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                            ⏰ {task.deadline}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Row 2: Planned selector (right-aligned) */}
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <span className="text-[10px] text-gray-400 font-medium">作業予定者:</span>
                      <select
                        value={task.planned}
                        onChange={e => updateTask(task.id, "planned", e.target.value)}
                        disabled={task.done}
                        className={`rounded-lg border text-xs px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
                          task.done
                            ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                            : task.planned === "当日事務担当"
                              ? "border-blue-200 bg-blue-50 text-blue-700 font-medium"
                              : task.planned === "当日現場責任者"
                                ? "border-amber-200 bg-amber-50 text-amber-700 font-medium"
                                : "border-gray-200 bg-white text-gray-600"
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

        {/* フッター操作パネル */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          {/* 完了済みを隠すトグル */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              role="switch"
              aria-checked={hideDone}
              onClick={() => setHideDone(v => !v)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
                hideDone ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  hideDone ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm text-gray-600 whitespace-nowrap">完了済みを隠す</span>
          </label>

          <div className="flex-1" />

          {lastSaved && <span className="text-gray-400 text-xs whitespace-nowrap">{lastSaved}</span>}

          <button
            onClick={undoLast}
            disabled={undoHistory.length === 0}
            title="元に戻す"
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              undoHistory.length > 0
                ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                : "border-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          >
            <Undo2 className="w-4 h-4" />
            <span>元に戻す</span>
          </button>

          <button
            onClick={handleReset}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            リセット
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 pb-6">
          データはクラウドに自動保存されます。複数デバイスでリアルタイム同期されます。
        </p>
      </main>
    </div>
  );
}

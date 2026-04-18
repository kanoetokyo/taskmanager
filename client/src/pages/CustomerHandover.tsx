/**
 * 顧客引き継ぎ専用ページ
 * - 日付をまたいで継続表示（getActiveで全件取得）
 * - 完了ステータスで自動削除
 * - 削除ボタンで手動削除
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowDownUp,
  Plus,
  Trash2,
  X,
  Users,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const MEMBER_LIST = [
  "前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい",
  "四藤", "ウララ", "森山", "勅使河原", "ベーさん", "篠原", "野村",
];

const STORE_NAMES_FULL = [
  "大井町店", "大森南店", "天満店", "戸越銀座駅前店",
  "大田中央店", "川崎新町店", "幸塚越店",
];

const CONTACT_OPTIONS = [
  "作業時追加",
  ...STORE_NAMES_FULL.map(s => `POS(${s})`),
  ...STORE_NAMES_FULL.map(s => `ラクーン(${s})`),
  ...STORE_NAMES_FULL.map(s => `LINE(${s})`),
  "フリーダイヤル",
  "来店",
  "SMS",
];

const CUSTOMER_STATUSES = ["これから", "不通・未対応", "調整中・仮予約中", "保留"] as const;

// ステータスの優先度順（数値が小さいほど上位）
const STATUS_ORDER: Record<string, number> = {
  "これから": 0,
  "不通・未対応": 1,
  "調整中・仮予約中": 2,
  "保留": 3,
  "完了": 4,
};
const CUSTOMER_STATUSES_ALL = [...CUSTOMER_STATUSES, "完了"] as const;
type CustomerStatus = typeof CUSTOMER_STATUSES_ALL[number];

const STATUS_STYLE: Record<CustomerStatus, string> = {
  "これから": "bg-sky-50 text-sky-600 border-sky-200",
  "不通・未対応": "bg-rose-50 text-rose-600 border-rose-200",
  "調整中・仮予約中": "bg-amber-50 text-amber-700 border-amber-200",
  "保留": "bg-stone-100 text-stone-500 border-stone-200",
  "完了": "bg-emerald-50 text-emerald-600 border-emerald-200",
};

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface CustomerRecord {
  id: string;
  name: string;
  status: CustomerStatus;
  contact: string;
  memo: string;
  assignee: string;
  links: string[];
}

function newCustomerRecord(): CustomerRecord {
  return {
    id: crypto.randomUUID(),
    name: "",
    status: "これから",
    contact: "",
    memo: "",
    assignee: "",
    links: [],
  };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── コンポーネント ───────────────────────────────────────────────────────────

export default function CustomerHandoverPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"added" | "status">("added");
  const [lastSaved, setLastSaved] = useState<string>("");

  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const isEditingRef = useRef(false);

  const { data: customerData, refetch } = trpc.task.customerHandover.getActive.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  const upsertCustomer = trpc.task.customerHandover.upsert.useMutation();
  const deleteCustomer = trpc.task.customerHandover.delete.useMutation();

  // DBデータをstateに反映
  useEffect(() => {
    if (customerData === undefined) return;
    const records: CustomerRecord[] = customerData.map(c => ({
      id: c.id,
      name: c.customerName,
      status: c.status as CustomerStatus,
      contact: c.store,
      memo: c.content,
      assignee: c.assignee ?? "",
      links: (c.links as string[]) ?? [],
    }));
    if (!loadedRef.current) {
      setCustomers(records);
      setTimeout(() => { loadedRef.current = true; }, 0);
    } else if (!isSavingRef.current && !isEditingRef.current) {
      setCustomers(records);
    }
  }, [customerData]);

  // テキスト入力の自動保存（0.8秒遅延）
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      isSavingRef.current = true;
      try {
        for (const c of customers) {
          if (c.status === "完了") continue;
          await upsertCustomer.mutateAsync({
            id: c.id,
            dateKey: todayKey(),
            customerName: c.name,
            store: c.contact,
            content: c.memo,
            status: c.status,
            assignee: c.assignee ?? "",
            links: c.links ?? [],
          });
        }
        const now = new Date();
        setLastSaved(`同期済み ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      } catch (e) {
        console.error("Customer autosave failed:", e);
      } finally {
        isSavingRef.current = false;
      }
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [customers]); // eslint-disable-line react-hooks/exhaustive-deps

  // フィールド更新
  const updateCustomer = (id: string, field: keyof CustomerRecord, value: string) => {
    setCustomers(prev => {
      const updated = prev.map(c => c.id !== id ? c : { ...c, [field]: value });
      const target = updated.find(c => c.id === id);
      if (!target) return prev;

      // 「完了」への変更：即座にDB削除
      if (field === "status" && value === "完了") {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        deleteCustomer.mutateAsync({ id })
          .then(() => {
            setCustomers(p => p.filter(r => r.id !== id));
            toast.success("完了として削除しました");
          })
          .catch(e => {
            console.error("Customer delete failed:", e);
            toast.error("削除に失敗しました。再試行してください。");
          });
        return updated;
      }

      // ステータス変更（完了以外）：即座にDB送信
      if (field === "status") {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        isSavingRef.current = true;
        upsertCustomer.mutateAsync({
          id: target.id,
          dateKey: todayKey(),
          customerName: target.name,
          store: target.contact,
          content: target.memo,
          status: value,
          assignee: target.assignee ?? "",
          links: target.links ?? [],
        })
          .then(() => {
            const now = new Date();
            setLastSaved(`同期済み ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
          })
          .catch(e => {
            console.error("Customer status update failed:", e);
            toast.error("ステータスの保存に失敗しました。");
          })
          .finally(() => { isSavingRef.current = false; });
        return updated;
      }

      // テキスト入力：遅延保存（useEffectに委ねる）
      return updated;
    });
  };

  // 手動削除
  const handleDelete = async (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    try {
      await deleteCustomer.mutateAsync({ id });
    } catch (e) {
      console.error("Customer delete failed:", e);
      toast.error("削除に失敗しました。");
    }
  };

  // 新規追加
  const handleAdd = () => {
    const rec = newCustomerRecord();
    setCustomers(prev => [...prev, rec]);
  };

  // フィルター・ソート
  const filtered = (filter === "all" ? customers : customers.filter(c => c.status === filter))
    .slice()
    .sort((a, b) => {
      if (sortMode === "status") {
        const diff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        return diff !== 0 ? diff : 0; // 同ステータス内は追加順を維持
      }
      return 0; // 追加順（配列の元の順序を維持）
    });

  const countByStatus = (s: string) =>
    s === "all" ? customers.length : customers.filter(c => c.status === s).length;

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-rose-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-rose-500 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              タスク管理へ戻る
            </button>
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-rose-700">
              <Users className="w-4 h-4" />
              顧客引き継ぎ
            </span>
            <span className="text-xs text-gray-400 bg-rose-50 px-2 py-0.5 rounded-full font-medium">
              {customers.length}件
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {lastSaved && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                {lastSaved}
              </span>
            )}
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              顧客を追加
            </button>
          </div>
        </div>
      </header>

      {/* フィルターバー */}
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", ...CUSTOMER_STATUSES] as string[]).map(s => {
            const count = countByStatus(s);
            const isActive = filter === s;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
                  isActive
                    ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                    : "bg-white text-gray-500 border-gray-200 hover:border-rose-300 hover:text-rose-500"
                }`}
              >
                {s === "all" ? "すべて" : s} ({count})
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setSortMode("added")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors border ${
                sortMode === "added"
                  ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                  : "bg-white text-gray-500 border-gray-200 hover:border-rose-300 hover:text-rose-500"
              }`}
            >
              <ArrowDownUp className="w-3 h-3" />
              追加順
            </button>
            <button
              onClick={() => setSortMode("status")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors border ${
                sortMode === "status"
                  ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                  : "bg-white text-gray-500 border-gray-200 hover:border-rose-300 hover:text-rose-500"
              }`}
            >
              <ArrowDownUp className="w-3 h-3" />
              ステータス順
            </button>
          </div>
        </div>
      </div>

      {/* 顧客リスト */}
      <div className="max-w-4xl mx-auto px-4 pb-8 space-y-3 mt-2">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {filter === "all"
                ? "引き継ぎが必要な顧客を追加してください"
                : "該当する顧客はいません"}
            </p>
          </div>
        )}

        {filtered.map(c => (
          <div
            key={c.id}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2"
          >
            {/* 行1: 顧客名・担当者・ステータス・削除 */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={c.name}
                onChange={e => updateCustomer(c.id, "name", e.target.value)}
                onFocus={() => { isEditingRef.current = true; }}
                onBlur={() => { isEditingRef.current = false; }}
                placeholder="顧客名を入力…"
                className="flex-1 min-w-[120px] text-sm font-semibold text-gray-800 border-0 border-b border-dashed border-gray-200 bg-transparent px-1 py-0.5 focus:outline-none focus:border-rose-300 placeholder-gray-300"
              />
              <select
                value={c.assignee}
                onChange={e => updateCustomer(c.id, "assignee", e.target.value)}
                className="text-xs px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 shrink-0"
              >
                <option value="">担当者</option>
                {MEMBER_LIST.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select
                value={c.status}
                onChange={e => updateCustomer(c.id, "status", e.target.value)}
                className={`text-xs px-2 py-1.5 rounded-md border font-medium focus:outline-none focus:ring-1 focus:ring-rose-300 shrink-0 ${STATUS_STYLE[c.status]}`}
              >
                {CUSTOMER_STATUSES_ALL.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                onClick={() => handleDelete(c.id)}
                className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors ml-auto"
                title="削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 行2: やりとり + メモ */}
            <div className="flex items-start gap-2 flex-wrap">
              <select
                value={c.contact}
                onChange={e => updateCustomer(c.id, "contact", e.target.value)}
                className="text-xs px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 shrink-0"
              >
                <option value="">やり取りを選択</option>
                {CONTACT_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <textarea
                ref={el => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }
                }}
                value={c.memo}
                onChange={e => {
                  updateCustomer(c.id, "memo", e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onFocus={() => { isEditingRef.current = true; }}
                onBlur={() => { isEditingRef.current = false; }}
                placeholder="メモを入力…"
                rows={1}
                className="flex-1 min-w-[160px] text-sm text-gray-700 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300 bg-white placeholder-gray-300 resize-none overflow-hidden"
                style={{ minHeight: "34px" }}
              />
            </div>

            {/* 行3: URLリンク（最大4件） */}
            <div className="flex flex-col gap-1 mt-0.5">
              {(c.links ?? []).map((link, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 shrink-0">🔗</span>
                  <input
                    type="url"
                    value={link}
                    onChange={e => {
                      const newLinks = [...(c.links ?? [])];
                      newLinks[idx] = e.target.value;
                      setCustomers(prev => prev.map(r => r.id === c.id ? { ...r, links: newLinks } : r));
                    }}
                    onFocus={() => { isEditingRef.current = true; }}
                    onBlur={() => { isEditingRef.current = false; }}
                    placeholder="URLを入力…"
                    className="flex-1 text-xs text-rose-600 border-0 border-b border-dashed border-gray-300 bg-transparent px-1 py-0.5 focus:outline-none focus:border-rose-300 placeholder-gray-300"
                  />
                  <button
                    onClick={() => {
                      const newLinks = (c.links ?? []).filter((_, i) => i !== idx);
                      setCustomers(prev => prev.map(r => r.id === c.id ? { ...r, links: newLinks } : r));
                    }}
                    className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                    title="リンクを削除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {(c.links ?? []).length < 4 && (
                <button
                  onClick={() => {
                    const newLinks = [...(c.links ?? []), ""];
                    setCustomers(prev => prev.map(r => r.id === c.id ? { ...r, links: newLinks } : r));
                  }}
                  className="text-xs text-gray-400 hover:text-rose-400 transition-colors flex items-center gap-1 mt-0.5 w-fit"
                >
                  <Plus className="w-3 h-3" />
                  リンクを追加
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

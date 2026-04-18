/**
 * 顧客引き継ぎ専用ページ（カンバン3列レイアウト）
 * - 「不通・未対応」「調整中・仮予約中」「保留」の3列表示
 * - 日付をまたいで継続表示（getActiveで全件取得）
 * - 完了ステータスで自動削除
 * - 削除ボタンで手動削除
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
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

const CUSTOMER_STATUSES_ALL = ["これから", "不通・未対応", "調整中・仮予約中", "保留", "完了"] as const;
type CustomerStatus = typeof CUSTOMER_STATUSES_ALL[number];

// カンバン列定義（3列）
const KANBAN_COLUMNS: { status: CustomerStatus; label: string; headerClass: string; badgeClass: string; addBtnClass: string }[] = [
  {
    status: "不通・未対応",
    label: "不通・未対応",
    headerClass: "bg-rose-50 border-rose-200",
    badgeClass: "bg-rose-100 text-rose-600",
    addBtnClass: "text-rose-400 hover:text-rose-600 hover:bg-rose-50",
  },
  {
    status: "調整中・仮予約中",
    label: "調整中・仮予約中",
    headerClass: "bg-amber-50 border-amber-200",
    badgeClass: "bg-amber-100 text-amber-700",
    addBtnClass: "text-amber-400 hover:text-amber-600 hover:bg-amber-50",
  },
  {
    status: "保留",
    label: "保留",
    headerClass: "bg-stone-50 border-stone-200",
    badgeClass: "bg-stone-100 text-stone-500",
    addBtnClass: "text-stone-400 hover:text-stone-600 hover:bg-stone-50",
  },
];

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

function newCustomerRecord(status: CustomerStatus = "不通・未対応"): CustomerRecord {
  return {
    id: crypto.randomUUID(),
    name: "",
    status,
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

// ─── カード コンポーネント ────────────────────────────────────────────────────

interface CustomerCardProps {
  c: CustomerRecord;
  onUpdate: (id: string, field: keyof CustomerRecord, value: string) => void;
  onDelete: (id: string) => void;
  onLinkChange: (id: string, links: string[]) => void;
  isEditingRef: React.MutableRefObject<boolean>;
}

function CustomerCard({ c, onUpdate, onDelete, onLinkChange, isEditingRef }: CustomerCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
      {/* 行1: 顧客名・担当者・削除 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={c.name}
          onChange={e => onUpdate(c.id, "name", e.target.value)}
          onFocus={() => { isEditingRef.current = true; }}
          onBlur={() => { isEditingRef.current = false; }}
          placeholder="顧客名を入力…"
          className="flex-1 min-w-0 text-sm font-semibold text-gray-800 border-0 border-b border-dashed border-gray-200 bg-transparent px-1 py-0.5 focus:outline-none focus:border-rose-300 placeholder-gray-300"
        />
        <select
          value={c.assignee}
          onChange={e => onUpdate(c.id, "assignee", e.target.value)}
          className="text-xs px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 shrink-0 max-w-[90px]"
        >
          <option value="">担当者</option>
          {MEMBER_LIST.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button
          onClick={() => onDelete(c.id)}
          className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
          title="削除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 行2: ステータス変更 */}
      <div className="flex items-center gap-2">
        <select
          value={c.status}
          onChange={e => onUpdate(c.id, "status", e.target.value)}
          className={`text-xs px-2 py-1.5 rounded-md border font-medium focus:outline-none focus:ring-1 focus:ring-rose-300 w-full ${STATUS_STYLE[c.status]}`}
        >
          {CUSTOMER_STATUSES_ALL.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* 行3: やりとり + メモ */}
      <div className="flex flex-col gap-1.5">
        <select
          value={c.contact}
          onChange={e => onUpdate(c.id, "contact", e.target.value)}
          className="text-xs px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 w-full"
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
            onUpdate(c.id, "memo", e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onFocus={() => { isEditingRef.current = true; }}
          onBlur={() => { isEditingRef.current = false; }}
          placeholder="メモを入力…"
          rows={1}
          className="text-sm text-gray-700 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300 bg-white placeholder-gray-300 resize-none overflow-hidden w-full"
          style={{ minHeight: "34px" }}
        />
      </div>

      {/* 行4: URLリンク（最大4件） */}
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
                onLinkChange(c.id, newLinks);
              }}
              onFocus={() => { isEditingRef.current = true; }}
              onBlur={() => { isEditingRef.current = false; }}
              placeholder="URLを入力…"
              className="flex-1 min-w-0 text-xs text-rose-600 border-0 border-b border-dashed border-gray-300 bg-transparent px-1 py-0.5 focus:outline-none focus:border-rose-300 placeholder-gray-300"
            />
            <button
              onClick={() => {
                const newLinks = (c.links ?? []).filter((_, i) => i !== idx);
                onLinkChange(c.id, newLinks);
              }}
              className="text-gray-300 hover:text-red-400 transition-colors p-0.5 shrink-0"
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
              onLinkChange(c.id, newLinks);
            }}
            className="text-xs text-gray-400 hover:text-rose-400 transition-colors flex items-center gap-1 mt-0.5 w-fit"
          >
            <Plus className="w-3 h-3" />
            リンクを追加
          </button>
        )}
      </div>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export default function CustomerHandoverPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [lastSaved, setLastSaved] = useState<string>("");

  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const isEditingRef = useRef(false);

  const { data: customerData } = trpc.task.customerHandover.getActive.useQuery(
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

  // リンク更新
  const handleLinkChange = (id: string, links: string[]) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, links } : c));
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

  // 列ごとに追加
  const handleAddToColumn = (status: CustomerStatus) => {
    const rec = newCustomerRecord(status);
    setCustomers(prev => [...prev, rec]);
  };

  const totalCount = customers.filter(c => c.status !== "完了").length;

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-rose-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
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
              {totalCount}件
            </span>
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

      {/* カンバン3列 */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KANBAN_COLUMNS.map(col => {
            const colCards = customers.filter(c => c.status === col.status);
            return (
              <div key={col.status} className="flex flex-col gap-2">
                {/* 列ヘッダー */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${col.headerClass}`}>
                  <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badgeClass}`}>
                    {colCards.length}件
                  </span>
                </div>

                {/* カード一覧 */}
                <div className="flex flex-col gap-2 min-h-[80px]">
                  {colCards.length === 0 && (
                    <div className="text-center py-6 text-gray-300 text-xs border-2 border-dashed border-gray-100 rounded-xl">
                      案件なし
                    </div>
                  )}
                  {colCards.map(c => (
                    <CustomerCard
                      key={c.id}
                      c={c}
                      onUpdate={updateCustomer}
                      onDelete={handleDelete}
                      onLinkChange={handleLinkChange}
                      isEditingRef={isEditingRef}
                    />
                  ))}
                </div>

                {/* 列ごとの追加ボタン */}
                <button
                  onClick={() => handleAddToColumn(col.status)}
                  className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border-2 border-dashed transition-colors ${col.addBtnClass} border-current`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  追加
                </button>
              </div>
            );
          })}
        </div>

        {/* 「これから」ステータスのカード（列外に表示） */}
        {(() => {
          const korekara = customers.filter(c => c.status === "これから");
          if (korekara.length === 0) return null;
          return (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-sky-600">これから</span>
                <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full font-medium">{korekara.length}件</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {korekara.map(c => (
                  <CustomerCard
                    key={c.id}
                    c={c}
                    onUpdate={updateCustomer}
                    onDelete={handleDelete}
                    onLinkChange={handleLinkChange}
                    isEditingRef={isEditingRef}
                  />
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

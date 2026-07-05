/**
 * 顧客引き継ぎ専用ページ（カンバン3列レイアウト）
 * - 「不通・未対応」「調整中・仮予約中」「保留」の3列表示
 * - 保留カードに期限バッジ（日付選択）を表示
 * - 期限超過カードの背景を赤に変更
 * - 日付をまたいで継続表示（getActiveで全件取得）
 * - 完了ステータスで自動削除
 * - 削除ボタンで手動削除
 *
 * 【設計方針 v4】
 * - 自動保存useEffectを廃止。各フィールド変更時に直接DB送信する。
 * - テキスト入力（name/memo/link）のみ300msデバウンスでDB送信。
 * - select変更（status/contact/assignee）は即時DB送信。
 * - 期限変更は即時DB送信。
 * - DBポーリング（30秒）は「初回ロードのみ全件反映」する。
 * - 2回目以降のポーリングは一切stateを変更しない（編集中データを保護）。
 * - 削除はUI即時反映 + DB非同期削除（ポーリングに依存しない）。
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  X,
  Users,
  RefreshCw,
  CalendarClock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const MEMBER_LIST = [
  "前田",
  "加藤",
  "泉",
  "新井なお",
  "新井さやか",
  "田邊まい",
  "四藤",
  "ウララ",
  "森山",
  "勅使河原",
  "ベーさん",
  "篠原",
  "野村",
  "中尾",
];

const STORE_NAMES_FULL = [
  "大井町店",
  "大森南店",
  "天満店",
  "戸越銀座駅前店",
  "大田中央店",
  "川崎新町店",
  "幸塚越店",
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

const CUSTOMER_STATUSES_ALL = [
  "これから",
  "不通・未対応",
  "調整中・仮予約中",
  "保留",
  "完了",
] as const;
type CustomerStatus = (typeof CUSTOMER_STATUSES_ALL)[number];

// カンバン列定義（3列）
const KANBAN_COLUMNS: {
  status: CustomerStatus;
  label: string;
  headerClass: string;
  badgeClass: string;
  addBtnClass: string;
}[] = [
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
  これから: "bg-sky-50 text-sky-600 border-sky-200",
  "不通・未対応": "bg-rose-50 text-rose-600 border-rose-200",
  "調整中・仮予約中": "bg-amber-50 text-amber-700 border-amber-200",
  保留: "bg-stone-100 text-stone-500 border-stone-200",
  完了: "bg-emerald-50 text-emerald-600 border-emerald-200",
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
  dueDate: number | null;
  callCount: number;
}

function newCustomerRecord(
  status: CustomerStatus = "不通・未対応"
): CustomerRecord {
  return {
    id: crypto.randomUUID(),
    name: "",
    status,
    contact: "",
    memo: "",
    assignee: "",
    links: [],
    dueDate: null,
    callCount: 0,
  };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function msToDateInput(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateInputToMs(val: string): number | null {
  if (!val) return null;
  const [y, m, d] = val.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function isOverdue(c: CustomerRecord): boolean {
  if (c.status !== "保留" || !c.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return c.dueDate < today.getTime();
}

function formatDueDate(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── カード コンポーネント ────────────────────────────────────────────────────

interface CustomerCardProps {
  c: CustomerRecord;
  onUpdate: (id: string, field: keyof CustomerRecord, value: string) => void;
  onDelete: (id: string) => void;
  onLinkChange: (id: string, links: string[]) => void;
  onDueDateChange: (id: string, dueDate: number | null) => void;
  onCalledToggle: (id: string, callCount?: number) => void;
}

const CustomerCard = memo(function CustomerCard({
  c,
  onUpdate,
  onDelete,
  onLinkChange,
  onDueDateChange,
  onCalledToggle,
}: CustomerCardProps) {
  const overdue = isOverdue(c);
  const isKorekara = c.status === "これから";
  const isUnreachable = c.status === "不通・未対応";
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  if (isUnreachable || isKorekara) {
    const cardTone = isUnreachable
      ? c.callCount >= 2
        ? "bg-red-50 border-red-300"
        : c.callCount === 1
          ? "bg-green-50 border-green-300"
          : "bg-white border-gray-100"
      : "bg-sky-50 border-sky-200";

    return (
      <div
        className={`rounded-xl border shadow-sm p-2.5 transition-colors ${cardTone}`}
      >
        <div className="flex items-start gap-1.5">
          <textarea
            value={c.name}
            onChange={e => onUpdate(c.id, "name", e.target.value)}
            placeholder="顧客名"
            rows={1}
            onInput={e => autosize(e.currentTarget)}
            ref={autosize}
            className={`w-[96px] shrink-0 text-sm font-semibold border-0 border-b border-dashed bg-transparent px-0.5 py-0.5 focus:outline-none placeholder-gray-300 mt-0.5 resize-none overflow-hidden ${
              isKorekara
                ? "text-sky-800 border-sky-200 focus:border-sky-400"
                : "text-gray-800 border-gray-200 focus:border-rose-300"
            }`}
          />
          <textarea
            value={c.memo}
            onChange={e => onUpdate(c.id, "memo", e.target.value)}
            placeholder="備考…"
            rows={1}
            onInput={e => autosize(e.currentTarget)}
            ref={autosize}
            className={`flex-1 min-w-0 text-sm border-0 border-b border-dashed bg-transparent px-0.5 py-0.5 focus:outline-none placeholder-gray-300 resize-none overflow-hidden ${
              isKorekara
                ? "text-sky-700 border-sky-200 focus:border-sky-400"
                : "text-gray-600 border-gray-200 focus:border-rose-300"
            }`}
          />
          <select
            value={c.assignee}
            onChange={e => onUpdate(c.id, "assignee", e.target.value)}
            className="text-xs px-1.5 py-1 rounded border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 shrink-0 max-w-[80px]"
          >
            <option value="">担当</option>
            {MEMBER_LIST.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={() => onDelete(c.id)}
            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
            title="削除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-1.5">
          <select
            value={c.status}
            onChange={e => onUpdate(c.id, "status", e.target.value)}
            className={`text-xs px-1.5 py-1 rounded border font-medium focus:outline-none focus:ring-1 ${
              isKorekara ? "focus:ring-sky-300" : "focus:ring-rose-300"
            } ${STATUS_STYLE[c.status]} shrink-0`}
          >
            {CUSTOMER_STATUSES_ALL.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {isUnreachable && (
            <select
              value={c.callCount >= 2 ? "2" : c.callCount === 1 ? "1" : "0"}
              onChange={e => onCalledToggle(c.id, Number(e.target.value))}
              className={`text-xs px-1.5 py-1 rounded border transition-colors shrink-0 ${
                c.callCount >= 2
                  ? "bg-red-100 border-red-400 text-red-700"
                  : c.callCount === 1
                    ? "bg-green-100 border-green-400 text-green-700"
                    : "bg-gray-50 border-gray-200 text-gray-500"
              }`}
            >
              <option value="0">📞未対応</option>
              <option value="1">📞1回目</option>
              <option value="2">📞最後通告済み</option>
            </select>
          )}
          <select
            value={c.contact}
            onChange={e => onUpdate(c.id, "contact", e.target.value)}
            className="text-xs px-1.5 py-1 rounded border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 flex-1 min-w-0"
          >
            <option value="">やり取り</option>
            {CONTACT_OPTIONS.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {(c.links ?? []).length > 0 && (
            <span className="text-xs text-blue-500 shrink-0">
              🔗{(c.links ?? []).length}
            </span>
          )}
          {(c.links ?? []).length < 4 && (
            <button
              onClick={() => onLinkChange(c.id, [...(c.links ?? []), ""])}
              className="text-xs text-gray-400 hover:text-rose-400 transition-colors shrink-0"
            >
              +URL
            </button>
          )}
        </div>

        {(c.links ?? []).length > 0 && (
          <div className="flex flex-col gap-0.5 mt-1">
            {(c.links ?? []).map((link, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="text-xs text-gray-400 shrink-0">🔗</span>
                <input
                  type="url"
                  value={link}
                  onChange={e => {
                    const newLinks = [...(c.links ?? [])];
                    newLinks[idx] = e.target.value;
                    onLinkChange(c.id, newLinks);
                  }}
                  placeholder="URL"
                  className="flex-1 min-w-0 text-xs text-blue-600 border-0 border-b border-dashed border-gray-200 bg-transparent px-0.5 py-0 focus:outline-none focus:border-rose-300 placeholder-gray-300 truncate"
                />
                <button
                  onClick={() => {
                    const newLinks = (c.links ?? []).filter(
                      (_, i) => i !== idx
                    );
                    onLinkChange(c.id, newLinks);
                  }}
                  className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border shadow-sm p-2.5 transition-colors ${
        overdue ? "bg-red-50 border-red-300" : "bg-white border-gray-100"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <textarea
          value={c.name}
          onChange={e => onUpdate(c.id, "name", e.target.value)}
          placeholder="顧客名"
          rows={1}
          onInput={e => autosize(e.currentTarget)}
          ref={autosize}
          className={`w-[96px] shrink-0 text-sm font-semibold border-0 border-b border-dashed bg-transparent px-0.5 py-0.5 focus:outline-none placeholder-gray-300 mt-0.5 resize-none overflow-hidden ${
            overdue
              ? "text-red-800 border-red-300 focus:border-red-500"
              : "text-gray-800 border-gray-200 focus:border-rose-300"
          }`}
        />
        <textarea
          value={c.memo}
          onChange={e => onUpdate(c.id, "memo", e.target.value)}
          placeholder="備考…"
          rows={1}
          onInput={e => autosize(e.currentTarget)}
          ref={autosize}
          className={`flex-1 min-w-0 text-sm border-0 border-b border-dashed bg-transparent px-0.5 py-0.5 focus:outline-none placeholder-gray-300 resize-none overflow-hidden ${
            overdue
              ? "text-red-700 border-red-300 focus:border-red-500"
              : "text-gray-600 border-gray-200 focus:border-rose-300"
          }`}
        />
        <select
          value={c.assignee}
          onChange={e => onUpdate(c.id, "assignee", e.target.value)}
          className="text-xs px-1.5 py-1 rounded border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 shrink-0 max-w-[80px]"
        >
          <option value="">担当</option>
          {MEMBER_LIST.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(c.id)}
          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
          title="削除"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        <select
          value={c.status}
          onChange={e => onUpdate(c.id, "status", e.target.value)}
          className={`text-xs px-1.5 py-1 rounded border font-medium focus:outline-none focus:ring-1 focus:ring-rose-300 shrink-0 ${STATUS_STYLE[c.status]}`}
        >
          {CUSTOMER_STATUSES_ALL.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={c.contact}
          onChange={e => onUpdate(c.id, "contact", e.target.value)}
          className="text-xs px-1.5 py-1 rounded border border-gray-200 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 flex-1 min-w-0"
        >
          <option value="">やり取り</option>
          {CONTACT_OPTIONS.map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {c.status === "保留" && (
          <div
            className={`flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded border text-xs font-medium ${
              overdue
                ? "bg-red-100 border-red-400 text-red-700"
                : c.dueDate
                  ? "bg-orange-50 border-orange-300 text-orange-700"
                  : "bg-gray-50 border-gray-200 text-gray-400"
            }`}
          >
            <CalendarClock className="w-3 h-3 shrink-0" />
            <input
              type="date"
              value={msToDateInput(c.dueDate)}
              onChange={e =>
                onDueDateChange(c.id, dateInputToMs(e.target.value))
              }
              className="bg-transparent border-0 outline-none text-xs w-[90px] cursor-pointer"
              title="期限を設定"
            />
            {c.dueDate && (
              <button
                onClick={() => onDueDateChange(c.id, null)}
                className="text-gray-400 hover:text-red-400 transition-colors"
                title="期限をクリア"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
        {(c.links ?? []).length > 0 && (
          <span className="text-xs text-blue-500 shrink-0">
            🔗{(c.links ?? []).length}
          </span>
        )}
        {(c.links ?? []).length < 4 && (
          <button
            onClick={() => onLinkChange(c.id, [...(c.links ?? []), ""])}
            className="text-xs text-gray-400 hover:text-rose-400 transition-colors shrink-0"
          >
            +URL
          </button>
        )}
      </div>

      {overdue && (
        <div className="flex items-center gap-1 text-xs text-red-600 font-semibold bg-red-100 border border-red-200 rounded px-2 py-0.5 mt-1">
          <CalendarClock className="w-3 h-3 shrink-0" />
          期限超過（{formatDueDate(c.dueDate)}）
        </div>
      )}

      {(c.links ?? []).length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {(c.links ?? []).map((link, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <span className="text-xs text-gray-400 shrink-0">🔗</span>
              <input
                type="url"
                value={link}
                onChange={e => {
                  const newLinks = [...(c.links ?? [])];
                  newLinks[idx] = e.target.value;
                  onLinkChange(c.id, newLinks);
                }}
                placeholder="URL"
                className="flex-1 min-w-0 text-xs text-blue-600 border-0 border-b border-dashed border-gray-200 bg-transparent px-0.5 py-0 focus:outline-none focus:border-rose-300 placeholder-gray-300 truncate"
              />
              <button
                onClick={() => {
                  const newLinks = (c.links ?? []).filter((_, i) => i !== idx);
                  onLinkChange(c.id, newLinks);
                }}
                className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─── メインコンポーネント ────────────────────────────────────────────────────

export default function CustomerHandover() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [lastSaved, setLastSaved] = useState<string>("");

  // タブタイトルを「顧客引継ぎ」に設定し、ページ離脱時に元に戻す
  useEffect(() => {
    const prev = document.title;
    document.title = "顧客引継ぎ";
    return () => {
      document.title = prev;
    };
  }, []);

  const loadedRef = useRef(false);
  // 最新のcustomers stateを常に保持する（非同期コールバック内で最新値を参照するため）
  const customersRef = useRef<CustomerRecord[]>([]);
  // テキスト入力のデバウンスタイマー（カードIDごとに管理）
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const { data: customerData } = trpc.task.customerHandover.getActive.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  const upsertCustomer = trpc.task.customerHandover.upsert.useMutation();
  const deleteCustomer = trpc.task.customerHandover.delete.useMutation();

  // customersが変わるたびにrefを同期
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  // DBデータをstateに反映
  // 【重要】初回ロードのみ全件上書き。2回目以降のポーリングはstateを変更しない。
  useEffect(() => {
    if (customerData === undefined) return;
    if (loadedRef.current) return; // 2回目以降は無視

    const records: CustomerRecord[] = customerData.map(c => ({
      id: c.id,
      name: c.customerName,
      status: c.status as CustomerStatus,
      contact: c.store,
      memo: c.content,
      assignee: c.assignee ?? "",
      links: (c.links as string[]) ?? [],
      dueDate: c.dueDate ?? null,
      callCount: c.callCount ?? 0,
    }));
    setCustomers(records);
    setTimeout(() => {
      loadedRef.current = true;
    }, 0);
  }, [customerData]);

  // DB送信ヘルパー（customersRefから最新データを取得して送信）
  const saveToDb = useCallback(
    async (id: string) => {
      const c = customersRef.current.find(r => r.id === id);
      if (!c) return;
      if (c.status === "完了") return;
      try {
        await upsertCustomer.mutateAsync({
          id: c.id,
          dateKey: todayKey(),
          customerName: c.name,
          store: c.contact,
          content: c.memo,
          status: c.status,
          assignee: c.assignee ?? "",
        links: c.links ?? [],
        dueDate: c.dueDate ?? null,
        callCount: c.callCount ?? 0,
      });
        const now = new Date();
        setLastSaved(
          `同期済み ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
        );
      } catch (e) {
        console.error("Customer save failed:", e);
        toast.error("保存に失敗しました。再試行してください。");
      }
    },
    [upsertCustomer]
  );

  // テキストフィールド用デバウンス送信（300ms）
  const saveToDbDebounced = useCallback(
    (id: string) => {
      const existing = debounceTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        debounceTimers.current.delete(id);
        saveToDb(id);
      }, 300);
      debounceTimers.current.set(id, timer);
    },
    [saveToDb]
  );

  // フィールド更新
  const updateCustomer = useCallback(
    (id: string, field: keyof CustomerRecord, value: string) => {
      setCustomers(prev => {
        const updated = prev.map(c =>
          c.id !== id ? c : { ...c, [field]: value }
        );
        // refも即座に更新（非同期コールバックで最新値を参照するため）
        customersRef.current = updated;

        const target = updated.find(c => c.id === id);
        if (!target) return prev;

        // 「完了」への変更：即座にUI削除 + DB削除
        if (field === "status" && value === "完了") {
          // 進行中のデバウンスタイマーをキャンセル
          const existing = debounceTimers.current.get(id);
          if (existing) {
            clearTimeout(existing);
            debounceTimers.current.delete(id);
          }
          deleteCustomer
            .mutateAsync({ id })
            .then(() => {
              toast.success("完了として削除しました");
            })
            .catch(e => {
              console.error("Customer delete failed:", e);
              toast.error("削除に失敗しました。");
            });
          const filtered = prev.filter(c => c.id !== id);
          customersRef.current = filtered;
          return filtered;
        }

        // select系（status/contact/assignee）は即時DB送信
        if (field === "status" || field === "contact" || field === "assignee") {
          // 進行中のデバウンスタイマーをキャンセルして即時送信
          const existing = debounceTimers.current.get(id);
          if (existing) {
            clearTimeout(existing);
            debounceTimers.current.delete(id);
          }
          // refが更新された後に送信するためsetTimeoutで1tick遅らせる
          setTimeout(() => saveToDb(id), 0);
          return updated;
        }

        // テキスト系（name/memo）はデバウンス送信
        setTimeout(() => saveToDbDebounced(id), 0);
        return updated;
      });
    },
    [saveToDb, saveToDbDebounced, deleteCustomer]
  );

  // 期限更新（即時DB送信）
  const handleDueDateChange = useCallback(
    (id: string, dueDate: number | null) => {
      setCustomers(prev => {
        const updated = prev.map(c => (c.id !== id ? c : { ...c, dueDate }));
        customersRef.current = updated;
        // 進行中のデバウンスタイマーをキャンセルして即時送信
        const existing = debounceTimers.current.get(id);
        if (existing) {
          clearTimeout(existing);
          debounceTimers.current.delete(id);
        }
        setTimeout(() => saveToDb(id), 0);
        return updated;
      });
    },
    [saveToDb]
  );

  // リンク更新（デバウンス送信）
  const handleLinkChange = useCallback(
    (id: string, links: string[]) => {
      setCustomers(prev => {
        const updated = prev.map(c => (c.id === id ? { ...c, links } : c));
        customersRef.current = updated;
        setTimeout(() => saveToDbDebounced(id), 0);
        return updated;
      });
    },
    [saveToDbDebounced]
  );

  const handleCalledToggle = useCallback(
    (id: string, callCount?: number) => {
      setCustomers(prev => {
        const updated = prev.map(c => {
          if (c.id !== id) return c;
          const nextCallCount =
            callCount ?? (c.callCount >= 2 ? 0 : c.callCount + 1);
          return {
            ...c,
            callCount: nextCallCount,
          };
        });
        customersRef.current = updated;
        const existing = debounceTimers.current.get(id);
        if (existing) {
          clearTimeout(existing);
          debounceTimers.current.delete(id);
        }
        setTimeout(() => saveToDb(id), 0);
        return updated;
      });
    },
    [saveToDb]
  );

  // 手動削除：UIから即座に除去 + DB非同期削除
  const handleDelete = useCallback(
    (id: string) => {
      // 進行中のデバウンスタイマーをキャンセル
      const existing = debounceTimers.current.get(id);
      if (existing) {
        clearTimeout(existing);
        debounceTimers.current.delete(id);
      }
      // UIから即座に除去
      setCustomers(prev => {
        const filtered = prev.filter(c => c.id !== id);
        customersRef.current = filtered;
        return filtered;
      });
      // DB非同期削除
      deleteCustomer
        .mutateAsync({ id })
        .then(() => {
          const now = new Date();
          setLastSaved(
            `同期済み ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
          );
        })
        .catch(e => {
          console.error("Customer delete failed:", e);
          toast.error("削除に失敗しました。");
        });
    },
    [deleteCustomer]
  );

  // 列ごとに追加
  const handleAddToColumn = useCallback(
    (status: CustomerStatus) => {
      const rec = newCustomerRecord(status);
      setCustomers(prev => {
        const updated = [...prev, rec];
        customersRef.current = updated;
        return updated;
      });
      // 新規カードをDBに即時保存
      setTimeout(() => saveToDb(rec.id), 0);
    },
    [saveToDb]
  );

  const totalCount = customers.filter(c => c.status !== "完了").length;
  const overdueCount = customers.filter(c => isOverdue(c)).length;

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-rose-100 shadow-sm">
        <div className="max-w-[90rem] mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-rose-500 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              タスク管理へ戻る
            </button>
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <span
              className="flex items-center gap-1.5 text-sm font-bold text-rose-700"
              style={{
                fontFamily: "'Zen Maru Gothic', 'Noto Sans JP', sans-serif",
                letterSpacing: "0.06em",
              }}
            >
              <Users className="w-4 h-4" />
              顧客引き継ぎ
            </span>
            <span className="text-xs text-gray-400 bg-rose-50 px-2 py-0.5 rounded-full font-medium">
              {totalCount}件
            </span>
            {overdueCount > 0 && (
              <span className="text-xs text-white bg-red-500 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <CalendarClock className="w-3 h-3" />
                期限超過 {overdueCount}件
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

      {/* カンバン3列 */}
      <div className="max-w-[90rem] mx-auto px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KANBAN_COLUMNS.map(col => {
            // 「不通・未対応」列は「これから」ステータスも含める
            const colCards =
              col.status === "不通・未対応"
                ? customers.filter(
                    c => c.status === "これから" || c.status === "不通・未対応"
                  )
                : customers.filter(c => c.status === col.status);
            // 「これから」を上部に、「不通・未対応」を下部に表示
            const sortedCards =
              col.status === "不通・未対応"
                ? [...colCards].sort((a, b) => {
                    const aCallRank =
                      a.callCount >= 2 ? 0 : a.callCount === 1 ? 1 : 2;
                    const bCallRank =
                      b.callCount >= 2 ? 0 : b.callCount === 1 ? 1 : 2;
                    if (aCallRank !== bCallRank) return aCallRank - bCallRank;
                    const aStatusRank = a.status === "これから" ? 0 : 1;
                    const bStatusRank = b.status === "これから" ? 0 : 1;
                    return aStatusRank - bStatusRank;
                  })
                : colCards;
            return (
              <div key={col.status} className="flex flex-col gap-3">
                {/* 列ヘッダー */}
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border ${col.headerClass}`}
                >
                  <span className="text-sm font-semibold text-gray-700">
                    {col.label}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badgeClass}`}
                  >
                    {sortedCards.length}件
                  </span>
                </div>

                {/* カード一覧 */}
                <div className="flex flex-col gap-3 min-h-[80px]">
                  {sortedCards.length === 0 && (
                    <div className="text-center py-6 text-gray-300 text-xs border-2 border-dashed border-gray-100 rounded-xl">
                      案件なし
                    </div>
                  )}
                  {(col.status === "保留"
                    ? [...sortedCards].sort((a, b) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const aOver =
                          a.dueDate !== null && a.dueDate < today.getTime();
                        const bOver =
                          b.dueDate !== null && b.dueDate < today.getTime();
                        if (aOver !== bOver) return aOver ? -1 : 1;
                        if (a.dueDate !== null && b.dueDate !== null)
                          return a.dueDate - b.dueDate;
                        if (a.dueDate !== null) return -1;
                        if (b.dueDate !== null) return 1;
                        return 0;
                      })
                    : sortedCards
                  ).map(c => (
                    <CustomerCard
                      key={c.id}
                      c={c}
                      onUpdate={updateCustomer}
                      onDelete={handleDelete}
                      onLinkChange={handleLinkChange}
                      onDueDateChange={handleDueDateChange}
                      onCalledToggle={handleCalledToggle}
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
      </div>
    </div>
  );
}

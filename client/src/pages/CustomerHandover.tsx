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
  Camera,
  Plus,
  Trash2,
  X,
  Users,
  RefreshCw,
  CalendarClock,
  ImageIcon,
  LoaderCircle,
  Share2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { createSerialSaveQueue } from "@/lib/serialSaveQueue";
import { MAX_CUSTOMER_PHOTOS, prepareCustomerPhoto } from "@/lib/customerPhoto";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { buildCustomerHandoverShare } from "@shared/customerHandoverShare";

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
  "ストアーズLINE",
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

function getTrpcErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function copyShareText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

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
  revision?: number;
}

interface CustomerAttachment {
  id: string;
  customerHandoverId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: Date | string;
  url: string | null;
}

const IS_DESIGN_QA_PREVIEW =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("designQa") === "1";

const IS_MOBILE_DESIGN_QA_PREVIEW =
  IS_DESIGN_QA_PREVIEW &&
  new URLSearchParams(window.location.search).get("mobileQa") === "1";

const DESIGN_QA_CUSTOMERS: CustomerRecord[] = [
  {
    id: "design-qa-final-call",
    name: "佐藤様",
    status: "不通・未対応",
    contact: "POS(大井町店)",
    memo: "SMSで予約サイト送付済み",
    assignee: "前田",
    links: [],
    dueDate: null,
    callCount: 2,
    revision: 1,
  },
  {
    id: "design-qa-first-call",
    name: "北村様",
    status: "不通・未対応",
    contact: "LINE(大森南店)",
    memo: "写真の内容を確認して折り返し予定",
    assignee: "加藤",
    links: [],
    dueDate: null,
    callCount: 1,
    revision: 1,
  },
];

const DESIGN_QA_ATTACHMENTS: CustomerAttachment[] = Array.from(
  { length: MAX_CUSTOMER_PHOTOS },
  (_, index) => ({
    id: `design-qa-photo-${index + 1}`,
    customerHandoverId: "design-qa-first-call",
    fileName: `customer-photo-${index + 1}.png`,
    mimeType: "image/png",
    sizeBytes: 1_000_000,
    sortOrder: index,
    createdAt: "2026-07-29T13:40:00+09:00",
    url: `/design-qa/customer-photo-${index + 1}.png`,
  })
);

function newCustomerRecord(
  status: CustomerStatus = "これから"
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
    revision: undefined,
  };
}

function toCustomerRecord(c: {
  id: string;
  customerName: string;
  status: string;
  store: string;
  content: string;
  assignee: string;
  links: unknown;
  dueDate: number | null;
  callCount: number;
  revision: number;
}): CustomerRecord {
  return {
    id: c.id,
    name: c.customerName,
    status: c.status as CustomerStatus,
    contact: c.store,
    memo: c.content,
    assignee: c.assignee ?? "",
    links: Array.isArray(c.links)
      ? c.links.filter((link): link is string => typeof link === "string")
      : [],
    dueDate: c.dueDate ?? null,
    callCount: c.callCount ?? 0,
    revision: c.revision,
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
  attachments: CustomerAttachment[];
  isUploadingPhotos: boolean;
  onUpdate: (id: string, field: keyof CustomerRecord, value: string) => void;
  onDelete: (id: string) => void;
  onLinkChange: (id: string, links: string[]) => void;
  onDueDateChange: (id: string, dueDate: number | null) => void;
  onCalledToggle: (id: string, callCount?: number) => void;
  onAddPhotos: (id: string, files: FileList) => void;
  onDeletePhoto: (attachment: CustomerAttachment) => void;
  onShare: (customer: CustomerRecord, photoCount: number) => void;
}

function formatAttachmentDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}登録`;
}

function CustomerPhotoSection({
  customer,
  attachments,
  isUploading,
  onAddPhotos,
  onDeletePhoto,
  onShare,
}: {
  customer: CustomerRecord;
  attachments: CustomerAttachment[];
  isUploading: boolean;
  onAddPhotos: (id: string, files: FileList) => void;
  onDeletePhoto: (attachment: CustomerAttachment) => void;
  onShare: (customer: CustomerRecord, photoCount: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<CustomerAttachment | null>(null);
  const remaining = MAX_CUSTOMER_PHOTOS - attachments.length;
  const firstCreatedAt = attachments[0]?.createdAt;

  return (
    <div className="mt-2.5 border-t border-rose-100 pt-2.5">
      {attachments.length > 0 && (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>
              {firstCreatedAt
                ? `${formatAttachmentDate(firstCreatedAt)}・`
                : ""}
              写真{attachments.length}枚
            </span>
            <span className="text-gray-400">最大{MAX_CUSTOMER_PHOTOS}枚</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {attachments.map((attachment, index) => (
              <div
                key={attachment.id}
                className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
              >
                {attachment.url ? (
                  <button
                    type="button"
                    className="h-full w-full"
                    onClick={() => setPreview(attachment)}
                    aria-label={`写真${index + 1}を拡大`}
                  >
                    <img
                      src={attachment.url}
                      alt={`顧客案件の写真 ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <ImageIcon className="h-7 w-7" aria-hidden="true" />
                    <span className="sr-only">写真を読み込めません</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onDeletePhoto(attachment)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1.5 text-gray-500 shadow-sm transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label={`写真${index + 1}を削除`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={event => {
          if (event.target.files?.length)
            onAddPhotos(customer.id, event.target.files);
          event.target.value = "";
        }}
      />

      <div
        className={`grid grid-cols-2 gap-2 ${attachments.length > 0 ? "mt-2" : ""}`}
      >
        <button
          type="button"
          onClick={() => onShare(customer, attachments.length)}
          className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#06C755] bg-white px-3 py-2 text-sm font-semibold text-[#06C755] transition-colors hover:bg-[#06C755]/10 focus:outline-none focus:ring-2 focus:ring-[#06C755]/30"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          LINEへ共有
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading || remaining <= 0}
          className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-500 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
        >
          {isUploading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4" aria-hidden="true" />
          )}
          {isUploading
            ? "保存中…"
            : attachments.length > 0
              ? remaining > 0
                ? "写真を追加"
                : "4枚登録済み"
              : "写真を追加"}
        </button>
      </div>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={open => !open && setPreview(null)}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-auto border-rose-100 bg-white p-3 sm:p-5">
          <DialogTitle className="pr-8 text-sm text-gray-700">
            写真を確認
          </DialogTitle>
          {preview?.url && (
            <img
              src={preview.url}
              alt="顧客案件の写真拡大表示"
              className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CustomerCard = memo(function CustomerCard({
  c,
  attachments,
  isUploadingPhotos,
  onUpdate,
  onDelete,
  onLinkChange,
  onDueDateChange,
  onCalledToggle,
  onAddPhotos,
  onDeletePhoto,
  onShare,
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
        id={`customer-card-${c.id}`}
        data-customer-id={c.id}
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
        <CustomerPhotoSection
          customer={c}
          attachments={attachments}
          isUploading={isUploadingPhotos}
          onAddPhotos={onAddPhotos}
          onDeletePhoto={onDeletePhoto}
          onShare={onShare}
        />
      </div>
    );
  }

  return (
    <div
      id={`customer-card-${c.id}`}
      data-customer-id={c.id}
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
      <CustomerPhotoSection
        customer={c}
        attachments={attachments}
        isUploading={isUploadingPhotos}
        onAddPhotos={onAddPhotos}
        onDeletePhoto={onDeletePhoto}
        onShare={onShare}
      />
    </div>
  );
});

// ─── メインコンポーネント ────────────────────────────────────────────────────

export default function CustomerHandover() {
  const [customers, setCustomers] = useState<CustomerRecord[]>(() =>
    IS_DESIGN_QA_PREVIEW ? DESIGN_QA_CUSTOMERS : []
  );
  const [designQaAttachments, setDesignQaAttachments] = useState<
    CustomerAttachment[]
  >(() => (IS_DESIGN_QA_PREVIEW ? DESIGN_QA_ATTACHMENTS : []));
  const [lastSaved, setLastSaved] = useState<string>("");
  const [uploadingPhotoIds, setUploadingPhotoIds] = useState<Set<string>>(
    new Set()
  );

  // タブタイトルを「顧客引継ぎ」に設定し、ページ離脱時に元に戻す
  useEffect(() => {
    const prev = document.title;
    document.title = "顧客引継ぎ";
    return () => {
      document.title = prev;
    };
  }, []);

  const loadedRef = useRef(false);
  const customersRef = useRef<CustomerRecord[]>([]);
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const customerSnapshotRef = useRef<Record<string, CustomerRecord>>({});
  const sharedCustomerIdRef = useRef(
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("customer")
  );
  const dirtyFieldsRef = useRef<Map<string, Set<keyof CustomerRecord>>>(
    new Map()
  );
  const changeVersionRef = useRef<Map<string, number>>(new Map());
  const saveRunnerRef = useRef<(id: string) => Promise<boolean>>(
    async () => true
  );
  const saveQueueRef = useRef(
    createSerialSaveQueue(id => saveRunnerRef.current(id))
  );

  const {
    data: customerData,
    error: customerError,
    refetch: refetchCustomers,
  } = trpc.task.customerHandover.getActive.useQuery(undefined, {
    enabled: !IS_DESIGN_QA_PREVIEW,
    refetchInterval: IS_DESIGN_QA_PREVIEW ? false : 30000,
  });
  const {
    data: attachmentData,
    error: attachmentError,
    refetch: refetchAttachments,
  } = trpc.task.customerHandoverAttachment.listActive.useQuery(undefined, {
    enabled: !IS_DESIGN_QA_PREVIEW,
    refetchInterval: IS_DESIGN_QA_PREVIEW ? false : 30000,
  });

  const upsertCustomer = trpc.task.customerHandover.upsert.useMutation();
  const patchCustomer = trpc.task.customerHandover.patch.useMutation();
  const deleteCustomer = trpc.task.customerHandover.delete.useMutation();
  const restoreCustomer = trpc.task.customerHandover.restore.useMutation();
  const uploadAttachment =
    trpc.task.customerHandoverAttachment.upload.useMutation();
  const deleteAttachment =
    trpc.task.customerHandoverAttachment.delete.useMutation();

  const effectiveAttachments = IS_DESIGN_QA_PREVIEW
    ? designQaAttachments
    : (attachmentData ?? []);
  const attachmentsByCustomer = effectiveAttachments.reduce<
    Record<string, CustomerAttachment[]>
  >((grouped, attachment) => {
    const current = grouped[attachment.customerHandoverId] ?? [];
    current.push(attachment as CustomerAttachment);
    grouped[attachment.customerHandoverId] = current;
    return grouped;
  }, {});

  const updateCustomerRevision = useCallback((id: string, revision: number) => {
    const nextCustomers = customersRef.current.map(record =>
      record.id === id ? { ...record, revision } : record
    );
    customersRef.current = nextCustomers;
    setCustomers(current => {
      return current.map(record =>
        record.id === id ? { ...record, revision } : record
      );
    });
  }, []);

  const refreshCustomerRevision = useCallback(
    async (id: string) => {
      try {
        const result = await refetchCustomers();
        const latest = result.data?.find(record => record.id === id);
        if (!latest) return;
        const serverRecord = toCustomerRecord(latest);
        customerSnapshotRef.current[id] = serverRecord;
        if (serverRecord.revision !== undefined) {
          updateCustomerRevision(id, serverRecord.revision);
        }
      } catch {
        // The current card stays untouched when the follow-up read also fails.
      }
    },
    [refetchCustomers, updateCustomerRevision]
  );

  // customersが変わるたびにrefを同期
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    if (customerData === undefined) return;
    const records = customerData.map(toCustomerRecord);
    const nextSnapshot = Object.fromEntries(
      records.map(record => [record.id, record])
    );
    if (!loadedRef.current) {
      customerSnapshotRef.current = nextSnapshot;
      setCustomers(records);
      loadedRef.current = true;
      return;
    }

    // A transient empty response must never erase the cards already on screen.
    if (records.length === 0 && customersRef.current.length > 0) return;
    setCustomers(current => {
      const currentIds = new Set(current.map(record => record.id));
      const serverById = new Map(records.map(record => [record.id, record]));
      const merged = current.map(record => {
        const fields = dirtyFieldsRef.current.get(record.id);
        const serverRecord = serverById.get(record.id);
        return !serverRecord || fields?.size ? record : serverRecord;
      });
      records.forEach(record => {
        if (!currentIds.has(record.id)) merged.push(record);
        if (!dirtyFieldsRef.current.get(record.id)?.size)
          customerSnapshotRef.current[record.id] = record;
      });
      return merged;
    });
  }, [customerData]);

  useEffect(() => {
    const customerId = sharedCustomerIdRef.current;
    if (!customerId || !customers.some(customer => customer.id === customerId))
      return;
    const element = document.getElementById(`customer-card-${customerId}`);
    if (!element) return;
    sharedCustomerIdRef.current = null;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-2", "ring-rose-400", "ring-offset-2");
    const timer = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-rose-400", "ring-offset-2");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [customers]);

  useEffect(
    () => () => {
      debounceTimers.current.forEach(timer => clearTimeout(timer));
      debounceTimers.current.clear();
      saveQueueRef.current.dispose();
    },
    []
  );

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (debounceTimers.current.size > 0 || dirtyFieldsRef.current.size > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const saveToDb = useCallback(
    async (id: string): Promise<boolean> => {
      if (IS_DESIGN_QA_PREVIEW) {
        dirtyFieldsRef.current.delete(id);
        setLastSaved(new Date().toLocaleTimeString("ja-JP"));
        return true;
      }
      const c = customersRef.current.find(r => r.id === id);
      if (!c) return true;
      const fields = new Set(dirtyFieldsRef.current.get(id) ?? []);
      if (fields.size === 0) return true;
      const version = changeVersionRef.current.get(id) ?? 0;
      try {
        const saved = c.revision
          ? await patchCustomer.mutateAsync({
              id: c.id,
              expectedRevision: c.revision,
              ...(fields.has("name") ? { customerName: c.name } : {}),
              ...(fields.has("contact") ? { store: c.contact } : {}),
              ...(fields.has("memo") ? { content: c.memo } : {}),
              ...(fields.has("status") ? { status: c.status } : {}),
              ...(fields.has("assignee") ? { assignee: c.assignee } : {}),
              ...(fields.has("links") ? { links: c.links } : {}),
              ...(fields.has("dueDate") ? { dueDate: c.dueDate } : {}),
              ...(fields.has("callCount") ? { callCount: c.callCount } : {}),
            })
          : await upsertCustomer.mutateAsync({
              id: c.id,
              dateKey: todayKey(),
              customerName: c.name,
              store: c.contact,
              content: c.memo,
              status: c.status,
              assignee: c.assignee,
              links: c.links,
              dueDate: c.dueDate,
              callCount: c.callCount,
              expectedRevision: undefined,
            });
        const serverRecord = toCustomerRecord(saved);
        customerSnapshotRef.current[id] = serverRecord;
        if ((changeVersionRef.current.get(id) ?? 0) === version) {
          dirtyFieldsRef.current.delete(id);
        }
        if (serverRecord.revision !== undefined) {
          updateCustomerRevision(id, serverRecord.revision);
        }
        const now = new Date();
        setLastSaved(
          `同期済み ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
        );
        return true;
      } catch (e) {
        console.error("Customer save failed:", e);
        void refreshCustomerRevision(id);
        if (getTrpcErrorCode(e) === "CONFLICT") {
          toast.error(
            "他の端末で先に更新されています。入力内容は画面に保持され、自動上書きはしていません。"
          );
        } else {
          toast.error(
            "保存結果を確認できません。入力内容は画面に保持されています。",
            {
              action: {
                label: "再試行",
                onClick: () => {
                  void refreshCustomerRevision(id).finally(() =>
                    saveQueueRef.current.request(id)
                  );
                },
              },
            }
          );
        }
        return false;
      }
    },
    [
      patchCustomer,
      refreshCustomerRevision,
      updateCustomerRevision,
      upsertCustomer,
    ]
  );

  saveRunnerRef.current = saveToDb;
  const requestCustomerSave = useCallback((id: string) => {
    saveQueueRef.current.request(id);
  }, []);

  // テキストフィールド用デバウンス送信（300ms）
  const saveToDbDebounced = useCallback(
    (id: string) => {
      const existing = debounceTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        debounceTimers.current.delete(id);
        requestCustomerSave(id);
      }, 300);
      debounceTimers.current.set(id, timer);
    },
    [requestCustomerSave]
  );

  const updateCustomer = useCallback(
    (id: string, field: keyof CustomerRecord, value: string) => {
      if (field === "status" && value === "完了") {
        const current = customersRef.current.find(record => record.id === id);
        if (!current) return;
        const complete = async () => {
          try {
            const saved = current.revision
              ? await patchCustomer.mutateAsync({
                  id,
                  expectedRevision: current.revision,
                  status: "完了",
                })
              : await upsertCustomer.mutateAsync({
                  id: current.id,
                  dateKey: todayKey(),
                  customerName: current.name,
                  store: current.contact,
                  content: current.memo,
                  status: "完了",
                  assignee: current.assignee,
                  links: current.links,
                  dueDate: current.dueDate,
                  callCount: current.callCount,
                  expectedRevision: undefined,
                });
            setCustomers(records => records.filter(record => record.id !== id));
            toast.success("完了として保存しました。", {
              action: {
                label: "元に戻す",
                onClick: async () => {
                  try {
                    const restored = await restoreCustomer.mutateAsync({
                      id,
                      expectedRevision: saved.revision,
                      status: current.status,
                    });
                    const restoredRecord = toCustomerRecord(restored);
                    customerSnapshotRef.current[id] = restoredRecord;
                    setCustomers(records => [...records, restoredRecord]);
                  } catch {
                    toast.error(
                      "復元に失敗しました。画面を更新して確認してください。"
                    );
                  }
                },
              },
            });
          } catch {
            toast.error("完了にできませんでした。データは変更されていません。");
          }
        };
        void complete();
        return;
      }
      setCustomers(prev => {
        const updated = prev.map(c =>
          c.id !== id ? c : { ...c, [field]: value }
        );
        customersRef.current = updated;
        const fields =
          dirtyFieldsRef.current.get(id) ?? new Set<keyof CustomerRecord>();
        fields.add(field);
        dirtyFieldsRef.current.set(id, fields);
        changeVersionRef.current.set(
          id,
          (changeVersionRef.current.get(id) ?? 0) + 1
        );
        if (field === "status" || field === "contact" || field === "assignee")
          setTimeout(() => requestCustomerSave(id), 0);
        else setTimeout(() => saveToDbDebounced(id), 0);
        return updated;
      });
    },
    [
      patchCustomer,
      requestCustomerSave,
      restoreCustomer,
      saveToDbDebounced,
      upsertCustomer,
    ]
  );

  // 期限更新（即時DB送信）
  const handleDueDateChange = useCallback(
    (id: string, dueDate: number | null) => {
      setCustomers(prev => {
        const updated = prev.map(c => (c.id !== id ? c : { ...c, dueDate }));
        customersRef.current = updated;
        dirtyFieldsRef.current.set(
          id,
          new Set<keyof CustomerRecord>([
            ...Array.from(dirtyFieldsRef.current.get(id) ?? []),
            "dueDate",
          ])
        );
        changeVersionRef.current.set(
          id,
          (changeVersionRef.current.get(id) ?? 0) + 1
        );
        setTimeout(() => requestCustomerSave(id), 0);
        return updated;
      });
    },
    [requestCustomerSave]
  );

  // リンク更新（デバウンス送信）
  const handleLinkChange = useCallback(
    (id: string, links: string[]) => {
      setCustomers(prev => {
        const updated = prev.map(c => (c.id === id ? { ...c, links } : c));
        customersRef.current = updated;
        dirtyFieldsRef.current.set(
          id,
          new Set<keyof CustomerRecord>([
            ...Array.from(dirtyFieldsRef.current.get(id) ?? []),
            "links",
          ])
        );
        changeVersionRef.current.set(
          id,
          (changeVersionRef.current.get(id) ?? 0) + 1
        );
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
        dirtyFieldsRef.current.set(
          id,
          new Set<keyof CustomerRecord>([
            ...Array.from(dirtyFieldsRef.current.get(id) ?? []),
            "callCount",
          ])
        );
        changeVersionRef.current.set(
          id,
          (changeVersionRef.current.get(id) ?? 0) + 1
        );
        setTimeout(() => requestCustomerSave(id), 0);
        return updated;
      });
    },
    [requestCustomerSave]
  );

  const handleAddPhotos = useCallback(
    async (id: string, files: FileList) => {
      const existingCount = attachmentsByCustomer[id]?.length ?? 0;
      const remaining = MAX_CUSTOMER_PHOTOS - existingCount;
      if (remaining <= 0) {
        toast.error(`写真は1案件${MAX_CUSTOMER_PHOTOS}枚までです。`);
        return;
      }

      const selected = Array.from(files).slice(0, remaining);
      if (files.length > remaining) {
        toast.info(`残り${remaining}枚だけ追加します。`);
      }

      if (IS_DESIGN_QA_PREVIEW) {
        setDesignQaAttachments(current => [
          ...current,
          ...selected.map((file, index) => ({
            id: `design-qa-upload-${crypto.randomUUID()}`,
            customerHandoverId: id,
            fileName: file.name,
            mimeType: file.type || "image/jpeg",
            sizeBytes: file.size,
            sortOrder: existingCount + index,
            createdAt: new Date().toISOString(),
            url: URL.createObjectURL(file),
          })),
        ]);
        toast.success(`写真${selected.length}枚を追加しました。`);
        return;
      }

      const timer = debounceTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.current.delete(id);
      }

      setUploadingPhotoIds(current => new Set(current).add(id));
      try {
        const saved = await saveQueueRef.current.flush(id);
        if (!saved) throw new Error("顧客カードを先に保存できませんでした。");

        for (const file of selected) {
          const prepared = await prepareCustomerPhoto(file);
          await uploadAttachment.mutateAsync({
            customerHandoverId: id,
            fileName: prepared.fileName,
            mimeType: prepared.mimeType,
            dataBase64: prepared.dataBase64,
          });
        }
        await refetchAttachments();
        toast.success(`写真${selected.length}枚を保存しました。`);
      } catch (error) {
        console.error("Customer photo upload failed:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "写真を保存できませんでした。"
        );
        await refetchAttachments();
      } finally {
        setUploadingPhotoIds(current => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [attachmentsByCustomer, refetchAttachments, uploadAttachment]
  );

  const handleDeletePhoto = useCallback(
    async (attachment: CustomerAttachment) => {
      if (!window.confirm("この写真を削除しますか？")) return;
      if (IS_DESIGN_QA_PREVIEW) {
        if (attachment.url?.startsWith("blob:")) {
          URL.revokeObjectURL(attachment.url);
        }
        setDesignQaAttachments(current =>
          current.filter(item => item.id !== attachment.id)
        );
        toast.success("写真を削除しました。");
        return;
      }
      try {
        await deleteAttachment.mutateAsync({ id: attachment.id });
        await refetchAttachments();
        toast.success("写真を削除しました。");
      } catch (error) {
        console.error("Customer photo delete failed:", error);
        toast.error("写真を削除できませんでした。");
      }
    },
    [deleteAttachment, refetchAttachments]
  );

  const handleShare = useCallback(
    async (customer: CustomerRecord, photoCount: number) => {
      const { title, text, url } = buildCustomerHandoverShare(
        customer.id,
        customer.name,
        photoCount,
        window.location.origin
      );

      try {
        if (navigator.share) {
          await navigator.share({ title, text, url });
          return;
        }
        await copyShareText(`${text}\n${url}`);
        toast.success("案件URLをコピーしました。LINEに貼り付けてください。");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Customer share failed:", error);
        toast.error("共有画面を開けませんでした。もう一度お試しください。");
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const record = customersRef.current.find(customer => customer.id === id);
      if (!record) return;
      const existing = debounceTimers.current.get(id);
      if (existing) {
        clearTimeout(existing);
        debounceTimers.current.delete(id);
      }
      if (!record.revision) {
        setCustomers(records => records.filter(customer => customer.id !== id));
        return;
      }
      try {
        const deleted = await deleteCustomer.mutateAsync({
          id,
          expectedRevision: record.revision,
        });
        setCustomers(records => records.filter(customer => customer.id !== id));
        toast.success("顧客引き継ぎをアーカイブしました。", {
          action: {
            label: "元に戻す",
            onClick: async () => {
              try {
                const restored = await restoreCustomer.mutateAsync({
                  id,
                  expectedRevision: deleted.revision,
                  status: record.status,
                });
                const restoredRecord = toCustomerRecord(restored);
                customerSnapshotRef.current[id] = restoredRecord;
                setCustomers(records => [...records, restoredRecord]);
              } catch {
                toast.error(
                  "復元に失敗しました。画面を更新して確認してください。"
                );
              }
            },
          },
        });
      } catch {
        toast.error("削除できませんでした。データは変更されていません。");
      }
    },
    [deleteCustomer, restoreCustomer]
  );

  // 列ごとに追加
  const handleAddToColumn = useCallback(
    (status: CustomerStatus = "これから", focusNewCustomer = false) => {
      const rec = newCustomerRecord(status);
      setCustomers(prev => {
        const updated = [rec, ...prev];
        customersRef.current = updated;
        return updated;
      });
      dirtyFieldsRef.current.set(
        rec.id,
        new Set<keyof CustomerRecord>([
          "name",
          "status",
          "contact",
          "memo",
          "assignee",
          "links",
          "dueDate",
          "callCount",
        ])
      );
      changeVersionRef.current.set(rec.id, 1);
      setTimeout(() => requestCustomerSave(rec.id), 0);
      if (focusNewCustomer) {
        setTimeout(() => {
          const card = document.getElementById(`customer-card-${rec.id}`);
          card?.scrollIntoView({ behavior: "smooth", block: "center" });
          card
            ?.querySelector<HTMLTextAreaElement>(
              'textarea[placeholder="顧客名"]'
            )
            ?.focus();
        }, 0);
      }
    },
    [requestCustomerSave]
  );

  const totalCount = customers.filter(c => c.status !== "完了").length;
  const overdueCount = customers.filter(c => isOverdue(c)).length;

  return (
    <div
      className={`min-h-screen bg-background ${IS_MOBILE_DESIGN_QA_PREVIEW ? "mx-auto max-w-[390px]" : ""}`}
    >
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-rose-100 shadow-sm">
        <div className="max-w-[90rem] mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-500 hover:text-rose-500 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              タスク管理へ戻る
            </button>
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <span
              className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold text-rose-700"
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
            {(customerError || attachmentError) && (
              <span className="text-xs text-rose-600 font-medium">
                接続できません。表示中のデータは保持されています。
              </span>
            )}
            {lastSaved && (
              <span
                className={`${IS_MOBILE_DESIGN_QA_PREVIEW ? "hidden" : "hidden sm:flex"} items-center gap-1 text-xs text-gray-400`}
              >
                <RefreshCw className="w-3 h-3" />
                {lastSaved}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* カンバン3列 */}
      <div className="max-w-[90rem] mx-auto px-6 py-4">
        <div
          className={`${IS_MOBILE_DESIGN_QA_PREVIEW ? "" : "md:hidden"} mb-4 rounded-xl border border-rose-200 bg-white p-2.5 shadow-sm`}
        >
          <button
            type="button"
            onClick={() => handleAddToColumn("これから", true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 active:bg-rose-700"
          >
            <Plus className="h-4 w-4" />
            新規顧客を追加
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
              これから
            </span>
          </button>
        </div>
        <div
          className={`grid grid-cols-1 gap-4 ${IS_MOBILE_DESIGN_QA_PREVIEW ? "" : "md:grid-cols-3"}`}
        >
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
                    const aStatusRank = a.status === "これから" ? 0 : 1;
                    const bStatusRank = b.status === "これから" ? 0 : 1;
                    if (aStatusRank !== bStatusRank)
                      return aStatusRank - bStatusRank;
                    const aCallRank =
                      a.callCount >= 2 ? 0 : a.callCount === 1 ? 1 : 2;
                    const bCallRank =
                      b.callCount >= 2 ? 0 : b.callCount === 1 ? 1 : 2;
                    return aCallRank - bCallRank;
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
                      attachments={attachmentsByCustomer[c.id] ?? []}
                      isUploadingPhotos={uploadingPhotoIds.has(c.id)}
                      onUpdate={updateCustomer}
                      onDelete={handleDelete}
                      onLinkChange={handleLinkChange}
                      onDueDateChange={handleDueDateChange}
                      onCalledToggle={handleCalledToggle}
                      onAddPhotos={handleAddPhotos}
                      onDeletePhoto={handleDeletePhoto}
                      onShare={handleShare}
                    />
                  ))}
                </div>

                {/* 列ごとの追加ボタン */}
                <button
                  onClick={() => handleAddToColumn(col.status)}
                  className={`${IS_MOBILE_DESIGN_QA_PREVIEW ? "hidden" : "hidden md:flex"} items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border-2 border-dashed transition-colors ${col.addBtnClass} border-current`}
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

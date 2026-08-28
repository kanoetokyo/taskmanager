import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Camera,
  ImagePlus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { createSerialSaveQueue } from "@/lib/serialSaveQueue";
import { ATINN_HANDOVER_CATEGORIES } from "@shared/const";

type ImageSlot = "before" | "after";
type AtinnHandoverCategory = "" | (typeof ATINN_HANDOVER_CATEGORIES)[number];

type AtinnIssue = {
  id: string;
  category: AtinnHandoverCategory;
  title: string;
  content: string;
  beforeImageUrl: string | null;
  afterImageUrl: string | null;
  sortOrder: number;
  revision?: number;
};

const MAX_SOURCE_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_UPLOAD_DATA_URL_LENGTH = 4_150_000;

function toAtinnHandoverCategory(category: string): AtinnHandoverCategory {
  return ATINN_HANDOVER_CATEGORIES.includes(category as (typeof ATINN_HANDOVER_CATEGORIES)[number])
    ? category as AtinnHandoverCategory
    : "";
}

function toAtinnIssue(issue: {
  id: string;
  category: string;
  title: string;
  content: string;
  beforeImageUrl: string | null;
  afterImageUrl: string | null;
  sortOrder: number;
  revision: number;
}): AtinnIssue {
  return {
    id: issue.id,
    category: toAtinnHandoverCategory(issue.category),
    title: issue.title,
    content: issue.content,
    beforeImageUrl: issue.beforeImageUrl,
    afterImageUrl: issue.afterImageUrl,
    sortOrder: issue.sortOrder,
    revision: issue.revision,
  };
}

function newAtinnIssue(sortOrder: number): AtinnIssue {
  return {
    id: crypto.randomUUID(),
    category: "",
    title: "",
    content: "",
    beforeImageUrl: null,
    afterImageUrl: null,
    sortOrder,
  };
}

function formatJstTime() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function getErrorMessage(error: unknown) {
  if (typeof error !== "object" || error === null) return "保存結果を確認できません。";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message ? message : "保存結果を確認できません。";
}

async function prepareImageUpload(file: File): Promise<string> {
  if (!/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type)) {
    throw new Error("JPEG・PNG・WebP形式の写真を選択してください。");
  }
  if (file.size > MAX_SOURCE_IMAGE_SIZE) {
    throw new Error("元の画像は20MB以下にしてください。");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      nextImage.src = objectUrl;
    });
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("画像の準備に失敗しました。");

    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const largestSide = Math.max(width, height);
    if (largestSide > 1600) {
      const ratio = 1600 / largestSide;
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) throw new Error("画像の準備に失敗しました。");
      canvasContext.drawImage(image, 0, 0, width, height);

      for (const quality of [0.86, 0.76, 0.66, 0.56]) {
        const imageData = canvas.toDataURL("image/jpeg", quality);
        if (imageData.length <= MAX_UPLOAD_DATA_URL_LENGTH) return imageData;
      }
      width = Math.round(width * 0.78);
      height = Math.round(height * 0.78);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  throw new Error("画像を3MB以下に圧縮できませんでした。別の写真を選択してください。");
}

function PhotoUploader({
  slot,
  imageUrl,
  disabled,
  uploading,
  onSelect,
}: {
  slot: ImageSlot;
  imageUrl: string | null;
  disabled: boolean;
  uploading: boolean;
  onSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = slot === "before" ? "Before" : "After";
  const tone = slot === "before" ? "rose" : "emerald";

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-bold ${tone === "rose" ? "text-rose-700" : "text-emerald-700"}`}>
          {label}
        </span>
        {imageUrl && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            変更
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onSelect(file);
        }}
      />
      {imageUrl ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="relative block w-full aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-wait"
        >
          <img src={imageUrl} alt={`${label}の指摘事項写真`} className="h-full w-full object-cover" />
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-semibold text-white">
              アップロード中…
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={`flex w-full aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === "rose"
              ? "border-rose-200 text-rose-500 hover:border-rose-400 hover:bg-rose-50"
              : "border-emerald-200 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50"
          }`}
        >
          {uploading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          {uploading ? "アップロード中…" : `${label}の写真を追加`}
        </button>
      )}
    </section>
  );
}

export default function AtinnHandover() {
  const [issues, setIssues] = useState<AtinnIssue[]>([]);
  const [lastSaved, setLastSaved] = useState("");
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const issuesRef = useRef<AtinnIssue[]>([]);
  const dirtyRef = useRef(new Set<string>());
  const versionsRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveRunnerRef = useRef<(id: string) => Promise<boolean>>(async () => true);
  const saveQueueRef = useRef(createSerialSaveQueue(id => saveRunnerRef.current(id)));

  const {
    data: issueData,
    error: issueError,
    refetch: refetchIssues,
  } = trpc.task.atinnHandover.list.useQuery(undefined, { refetchInterval: 30000 });
  const upsertIssue = trpc.task.atinnHandover.upsert.useMutation();
  const uploadIssueImage = trpc.task.atinnHandover.uploadImage.useMutation();
  const deleteIssue = trpc.task.atinnHandover.delete.useMutation();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "アットイン引き継ぎ";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    issuesRef.current = issues;
  }, [issues]);

  useEffect(() => {
    if (issueData === undefined) return;
    const records = issueData.map(toAtinnIssue);
    setIssues(current => {
      const currentById = new Map(current.map(issue => [issue.id, issue]));
      const synchronized = records.map(record => {
        const local = currentById.get(record.id);
        return local && dirtyRef.current.has(record.id) ? local : record;
      });
      const unsaved = current.filter(issue => !issue.revision && !records.some(record => record.id === issue.id));
      const next = [...synchronized, ...unsaved];
      issuesRef.current = next;
      return next;
    });
  }, [issueData]);

  useEffect(() => () => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    saveQueueRef.current.dispose();
  }, []);

  const setRevision = useCallback((id: string, revision: number) => {
    const next = issuesRef.current.map(issue => issue.id === id ? { ...issue, revision } : issue);
    issuesRef.current = next;
    setIssues(next);
  }, []);

  const saveIssue = useCallback(async (id: string): Promise<boolean> => {
    const issue = issuesRef.current.find(record => record.id === id);
    if (!issue || !dirtyRef.current.has(id)) return true;
    const version = versionsRef.current.get(id) ?? 0;
    try {
      const saved = await upsertIssue.mutateAsync({
        id: issue.id,
        category: issue.category,
        title: issue.title,
        content: issue.content,
        beforeImageUrl: issue.beforeImageUrl,
        afterImageUrl: issue.afterImageUrl,
        sortOrder: issue.sortOrder,
        expectedRevision: issue.revision,
      });
      if ((versionsRef.current.get(id) ?? 0) === version) {
        dirtyRef.current.delete(id);
      }
      setRevision(id, saved.revision);
      setLastSaved(`同期済み ${formatJstTime()}`);
      return true;
    } catch (error) {
      console.error("AtInn handover save failed:", error);
      if (getErrorMessage(error).includes("先に更新")) {
        toast.error("他の端末で先に更新されています。ページを更新して確認してください。");
      } else {
        toast.error("保存できませんでした。入力内容は画面に保持されています。", {
          action: {
            label: "再試行",
            onClick: () => void refetchIssues().finally(() => saveQueueRef.current.request(id)),
          },
        });
      }
      return false;
    }
  }, [refetchIssues, setRevision, upsertIssue]);

  saveRunnerRef.current = saveIssue;
  const requestSave = useCallback((id: string) => {
    saveQueueRef.current.request(id);
  }, []);

  const scheduleSave = useCallback((id: string, immediate = false) => {
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    if (immediate) {
      timersRef.current.delete(id);
      requestSave(id);
      return;
    }
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      requestSave(id);
    }, 350);
    timersRef.current.set(id, timer);
  }, [requestSave]);

  const updateIssue = useCallback((id: string, updates: Partial<AtinnIssue>, immediate = false) => {
    setIssues(current => {
      const next = current.map(issue => issue.id === id ? { ...issue, ...updates } : issue);
      issuesRef.current = next;
      return next;
    });
    dirtyRef.current.add(id);
    versionsRef.current.set(id, (versionsRef.current.get(id) ?? 0) + 1);
    scheduleSave(id, immediate);
  }, [scheduleSave]);

  const addIssue = useCallback(() => {
    const sortOrder = issuesRef.current.reduce((max, issue) => Math.max(max, issue.sortOrder), -1) + 1;
    const issue = newAtinnIssue(sortOrder);
    const next = [...issuesRef.current, issue];
    issuesRef.current = next;
    setIssues(next);
    dirtyRef.current.add(issue.id);
    versionsRef.current.set(issue.id, 1);
    requestSave(issue.id);
  }, [requestSave]);

  const handleDelete = useCallback(async (id: string) => {
    const issue = issuesRef.current.find(record => record.id === id);
    if (!issue) return;
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    if (!issue.revision) {
      const next = issuesRef.current.filter(record => record.id !== id);
      issuesRef.current = next;
      setIssues(next);
      return;
    }
    try {
      await deleteIssue.mutateAsync({ id, expectedRevision: issue.revision });
      dirtyRef.current.delete(id);
      const next = issuesRef.current.filter(record => record.id !== id);
      issuesRef.current = next;
      setIssues(next);
      toast.success("指摘事項を削除しました。");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [deleteIssue]);

  const handlePhotoSelect = useCallback(async (issue: AtinnIssue, slot: ImageSlot, file: File) => {
    if (!issue.revision) {
      toast.error("指摘事項の作成完了後に写真を追加できます。数秒後にもう一度お試しください。");
      return;
    }
    const uploadKey = `${issue.id}:${slot}`;
    setUploading(current => ({ ...current, [uploadKey]: true }));
    try {
      const imageData = await prepareImageUpload(file);
      const uploaded = await uploadIssueImage.mutateAsync({ id: issue.id, slot, imageData });
      updateIssue(issue.id, slot === "before" ? { beforeImageUrl: uploaded.url } : { afterImageUrl: uploaded.url }, true);
      toast.success(`${slot === "before" ? "Before" : "After"}写真を追加しました。`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setUploading(current => ({ ...current, [uploadKey]: false }));
    }
  }, [updateIssue, uploadIssueImage]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-sky-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[90rem] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 sm:py-3">
          <Link href="/">
            <button className="flex shrink-0 items-center gap-1 text-xs text-gray-500 transition-colors hover:text-sky-600 sm:gap-1.5 sm:text-sm">
              <ArrowLeft className="h-4 w-4" />
              タスク管理へ戻る
            </button>
          </Link>
          <div className="flex min-w-0 items-center gap-1 sm:ml-2 sm:gap-2">
            <span
              className="flex shrink-0 items-center gap-1 text-xs font-bold text-sky-700 sm:gap-1.5 sm:text-sm"
              style={{ fontFamily: "'Zen Maru Gothic', 'Noto Sans JP', sans-serif", letterSpacing: "0.06em" }}
            >
              <Camera className="h-4 w-4" />
              アットイン引き継ぎ
            </span>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-gray-500">
              {issues.length}件
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {issueError && <span className="hidden text-xs font-medium text-rose-600 lg:inline">接続できません。表示中のデータは保持されています。</span>}
            {lastSaved && <span className="hidden items-center gap-1 text-xs text-gray-400 sm:flex"><RefreshCw className="h-3 w-3" />{lastSaved}</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3">
          <div>
            <h1 className="text-base font-bold text-gray-800">よくある指摘事項</h1>
            <p className="mt-0.5 text-xs text-gray-500">カテゴリごとにBefore／After写真を追加して、引き継ぎ時の基準を共有します。</p>
          </div>
          <button
            type="button"
            onClick={addIssue}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-sky-700"
          >
            <Plus className="h-3.5 w-3.5" />
            指摘事項を追加
          </button>
        </div>

        {issues.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
            <ImagePlus className="mx-auto h-7 w-7 text-sky-300" />
            <p className="mt-3 text-sm font-medium text-gray-500">まだ指摘事項がありません</p>
            <p className="mt-1 text-xs text-gray-400">「指摘事項を追加」から、写真付きの事例を登録できます。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {issues.map((issue, index) => (
              <article key={issue.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-2">
                  <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-100 px-1 text-[11px] font-bold text-sky-700">
                    {index + 1}
                  </span>
                  <input
                    value={issue.title}
                    onChange={event => updateIssue(issue.id, { title: event.target.value })}
                    placeholder="指摘事項のタイトル"
                    className="min-w-0 flex-1 border-0 border-b border-dashed border-gray-200 bg-transparent px-1 py-1 text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-300 focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => void handleDelete(issue.id)}
                    className="rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="この指摘事項を削除"
                    aria-label="この指摘事項を削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <label className="mb-4 flex items-center gap-2 text-xs font-medium text-gray-600">
                  カテゴリ
                  <select
                    value={issue.category}
                    onChange={event => updateIssue(issue.id, { category: toAtinnHandoverCategory(event.target.value) }, true)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 outline-none focus:border-sky-400"
                  >
                    <option value="">カテゴリを選択</option>
                    {ATINN_HANDOVER_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <textarea
                  value={issue.content}
                  onChange={event => updateIssue(issue.id, { content: event.target.value })}
                  placeholder="どこを、どの状態まで整えるかを記入"
                  rows={2}
                  className="mb-4 w-full resize-y rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 text-sm leading-relaxed text-gray-700 outline-none placeholder:text-gray-300 focus:border-sky-400 focus:bg-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <PhotoUploader
                    slot="before"
                    imageUrl={issue.beforeImageUrl}
                    disabled={!issue.revision}
                    uploading={Boolean(uploading[`${issue.id}:before`])}
                    onSelect={file => void handlePhotoSelect(issue, "before", file)}
                  />
                  <PhotoUploader
                    slot="after"
                    imageUrl={issue.afterImageUrl}
                    disabled={!issue.revision}
                    uploading={Boolean(uploading[`${issue.id}:after`])}
                    onSelect={file => void handlePhotoSelect(issue, "after", file)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

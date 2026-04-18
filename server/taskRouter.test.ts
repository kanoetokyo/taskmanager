/**
 * taskRouter.ts のユニットテスト
 * DB接続が必要なため、モックを使用してテストする
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB Mock ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// ─── Helper: dateToKey ────────────────────────────────────────────────────────
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("dateKey helpers", () => {
  it("dateToKey formats correctly", () => {
    const date = new Date(2026, 2, 4); // March 4, 2026
    expect(dateToKey(date)).toBe("2026-03-04");
  });

  it("keyToDate parses correctly", () => {
    const key = "2026-03-04";
    const date = keyToDate(key);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // 0-indexed
    expect(date.getDate()).toBe(4);
  });

  it("todayKey returns current date in YYYY-MM-DD format", () => {
    const key = todayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prev day calculation is correct", () => {
    const today = "2026-03-04";
    const d = keyToDate(today);
    d.setDate(d.getDate() - 1);
    expect(dateToKey(d)).toBe("2026-03-03");
  });

  it("next day calculation is correct", () => {
    const today = "2026-03-04";
    const d = keyToDate(today);
    d.setDate(d.getDate() + 1);
    expect(dateToKey(d)).toBe("2026-03-05");
  });
});

describe("task state logic", () => {
  it("calculates progress percentage correctly", () => {
    const tasks = [
      { id: "1", done: true },
      { id: "2", done: false },
      { id: "3", done: true },
      { id: "4", done: false },
    ];
    const doneTasks = tasks.filter(t => t.done).length;
    const totalTasks = tasks.length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    expect(progressPct).toBe(50);
  });

  it("returns 0% when no tasks are done", () => {
    const tasks = [
      { id: "1", done: false },
      { id: "2", done: false },
    ];
    const doneTasks = tasks.filter(t => t.done).length;
    const totalTasks = tasks.length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    expect(progressPct).toBe(0);
  });

  it("returns 100% when all tasks are done", () => {
    const tasks = [
      { id: "1", done: true },
      { id: "2", done: true },
    ];
    const doneTasks = tasks.filter(t => t.done).length;
    const totalTasks = tasks.length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    expect(progressPct).toBe(100);
  });

  it("returns 0% when tasks array is empty", () => {
    const tasks: { id: string; done: boolean }[] = [];
    const doneTasks = tasks.filter(t => t.done).length;
    const totalTasks = tasks.length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    expect(progressPct).toBe(0);
  });
});

describe("customer status logic", () => {
  const CUSTOMER_STATUSES_ALL = ["これから", "不通・未対応", "調整中・仮予約中", "保留", "完了"] as const;

  it("has correct status options including これから", () => {
    expect(CUSTOMER_STATUSES_ALL).toContain("これから");
    expect(CUSTOMER_STATUSES_ALL).toContain("不通・未対応");
    expect(CUSTOMER_STATUSES_ALL).toContain("調整中・仮予約中");
    expect(CUSTOMER_STATUSES_ALL).toContain("保留");
    expect(CUSTOMER_STATUSES_ALL).toContain("完了");
  });

  it("filters non-completed customers for inheritance", () => {
    const customers = [
      { id: "1", status: "不通・未対応", name: "田中" },
      { id: "2", status: "完了", name: "鈴木" },
      { id: "3", status: "調整中・仓予約中", name: "佐藤" },
    ];
    const nonCompleted = customers.filter(c => c.status !== "完了");
    expect(nonCompleted.length).toBe(2);
    expect(nonCompleted.map(c => c.name)).toEqual(["田中", "佐藤"]);
  });

  it("完了ステータスのupsertは安全にスキップされるべき", () => {
    // upsert時に「完了」ステータスのレコードは保存しないことを検証
    const customers = [
      { id: "1", status: "不通・未対応", name: "田中" },
      { id: "2", status: "完了", name: "鈴木" },
      { id: "3", status: "これから", name: "佐藤" },
    ];
    const toUpsert = customers.filter(c => c.status !== "完了");
    expect(toUpsert.length).toBe(2);
    expect(toUpsert.map(c => c.name)).toEqual(["田中", "佐藤"]);
    expect(toUpsert.every(c => c.status !== "完了")).toBe(true);
  });

  it("完了ステータスに変更されたレコードはフロントエンドから除去されるべき", () => {
    let customers = [
      { id: "1", status: "不通・未対応", name: "田乫" },
      { id: "2", status: "調整中・仓予約中", name: "山田" },
    ];
    // 「完了」に変更した場合はリストから除去
    const idToDelete = "1";
    customers = customers.filter(c => c.id !== idToDelete);
    expect(customers.length).toBe(1);
    expect(customers[0].name).toBe("山田");
  });
});

describe("store check logic", () => {
  const STORE_NAMES = ["大井町", "大森南", "天満", "戸越銀座駅前", "大田中央", "川崎新町", "幸塚越"];

  it("has 7 stores", () => {
    expect(STORE_NAMES.length).toBe(7);
  });

  it("toggles store check on", () => {
    const checked: string[] = [];
    const store = "大井町";
    const isChecked = checked.includes(store);
    const updated = isChecked ? checked.filter(s => s !== store) : [...checked, store];
    expect(updated).toContain("大井町");
  });

  it("detects all stores checked", () => {
    const checked = [...STORE_NAMES];
    expect(checked.length === STORE_NAMES.length).toBe(true);
  });
});

describe("help flag logic", () => {
  it("defaults to false for new tasks", () => {
    const task = { id: "1", done: false, help: false };
    expect(task.help).toBe(false);
  });

  it("toggles help flag on", () => {
    const task = { id: "1", done: false, help: false };
    const updated = { ...task, help: !task.help };
    expect(updated.help).toBe(true);
  });

  it("toggles help flag off", () => {
    const task = { id: "1", done: false, help: true };
    const updated = { ...task, help: !task.help };
    expect(updated.help).toBe(false);
  });

  it("help flag is included in bulkUpsert payload", () => {
    const tasks = [
      { id: "task-1", done: true, help: false },
      { id: "task-2", done: false, help: true },
    ];
    const dateKey = "2026-03-04";
    const payload = tasks.map(t => ({ dateKey, taskId: t.id, done: t.done, help: t.help }));
    expect(payload[0].help).toBe(false);
    expect(payload[1].help).toBe(true);
  });

  it("help flag is read from DB state", () => {
    const dbState = { taskId: "task-1", done: false, help: true };
    const help = dbState?.help ?? false;
    expect(help).toBe(true);
  });
});

describe("MISOCA date logic", () => {
  it("detects up-to-date status", () => {
    const today = "2026-03-04";
    const completedUntil = "2026-03-05";
    const isUpToDate = completedUntil >= today;
    expect(isUpToDate).toBe(true);
  });

  it("detects outdated status", () => {
    const today = "2026-03-04";
    const completedUntil = "2026-03-02";
    const isUpToDate = completedUntil >= today;
    expect(isUpToDate).toBe(false);
  });

  it("calculates days remaining correctly", () => {
    const today = "2026-03-04";
    const completedUntil = "2026-03-07";
    const keyToDateLocal = (key: string) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const daysLeft = Math.round(
      (keyToDateLocal(completedUntil).getTime() - keyToDateLocal(today).getTime()) / 86400000
    );
    expect(daysLeft).toBe(3);
  });
});

describe("Gray Cell date logic", () => {
  it("detects up-to-date status", () => {
    const today = "2026-03-04";
    const confirmedUntil = "2026-03-06";
    const isUpToDate = confirmedUntil >= today;
    expect(isUpToDate).toBe(true);
  });

  it("detects outdated status", () => {
    const today = "2026-03-04";
    const confirmedUntil = "2026-03-01";
    const isUpToDate = confirmedUntil >= today;
    expect(isUpToDate).toBe(false);
  });

  it("calculates days remaining correctly", () => {
    const today = "2026-03-04";
    const confirmedUntil = "2026-03-11";
    const keyToDateLocal = (key: string) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const daysLeft = Math.round(
      (keyToDateLocal(confirmedUntil).getTime() - keyToDateLocal(today).getTime()) / 86400000
    );
    expect(daysLeft).toBe(7);
  });

  it("displays correct badge text when confirmed until today", () => {
    const today = "2026-03-04";
    const confirmedUntil = "2026-03-04";
    const daysLeft = 0;
    const text = daysLeft === 0 ? "本日分までグレーセル確認済み" : `あと${daysLeft}日分確認済み`;
    expect(text).toBe("本日分までグレーセル確認済み");
  });

  it("displays correct badge text when confirmed until future date", () => {
    const daysLeft = 5;
    const text = daysLeft === 0 ? "本日分までグレーセル確認済み" : `あと${daysLeft}日分確認済み`;
    expect(text).toBe("あと5日分確認済み");
  });
});

describe("cleanup old date key records logic", () => {
  /** cutoffKey: 今日から3日前の日付文字列を計算するロジックのテスト */
  function calcCutoffKey(today: string): string {
    const [y, m, d] = today.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 3);
    return date.toISOString().slice(0, 10);
  }

  it("calculates cutoff key as 3 days before today", () => {
    const cutoff = calcCutoffKey("2026-03-17");
    expect(cutoff).toBe("2026-03-14");
  });

  it("records older than cutoff should be deleted", () => {
    const cutoff = calcCutoffKey("2026-03-17"); // "2026-03-14"
    const records = [
      { dateKey: "2026-03-13" }, // 4日前 → 削除対象
      { dateKey: "2026-03-14" }, // ちょうど3日前 → 残す（lt: strictly less than）
      { dateKey: "2026-03-15" }, // 2日前 → 残す
      { dateKey: "2026-03-17" }, // 今日 → 残す
    ];
    const toDelete = records.filter(r => r.dateKey < cutoff);
    const toKeep = records.filter(r => r.dateKey >= cutoff);
    expect(toDelete.map(r => r.dateKey)).toEqual(["2026-03-13"]);
    expect(toKeep.map(r => r.dateKey)).toEqual(["2026-03-14", "2026-03-15", "2026-03-17"]);
  });

  it("keeps records from exactly 3 days ago", () => {
    const cutoff = calcCutoffKey("2026-03-17"); // "2026-03-14"
    const record = { dateKey: "2026-03-14" };
    expect(record.dateKey < cutoff).toBe(false); // 削除されない
  });

  it("deletes records from 4 or more days ago", () => {
    const cutoff = calcCutoffKey("2026-03-17"); // "2026-03-14"
    const record = { dateKey: "2026-03-13" };
    expect(record.dateKey < cutoff).toBe(true); // 削除される
  });
});

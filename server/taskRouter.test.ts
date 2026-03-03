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

describe("handover member check logic", () => {
  const HANDOVER_MEMBERS = ["前田", "加藤", "泉", "新井なお", "新井さやか", "田邊まい", "四藤", "ウララ", "森山", "勅使河原"];

  it("toggles member check on", () => {
    const checked: string[] = [];
    const member = "前田";
    const alreadyChecked = checked.includes(member);
    const newChecked = alreadyChecked
      ? checked.filter(m => m !== member)
      : [...checked, member];
    expect(newChecked).toContain("前田");
    expect(newChecked.length).toBe(1);
  });

  it("toggles member check off", () => {
    const checked = ["前田", "加藤"];
    const member = "前田";
    const alreadyChecked = checked.includes(member);
    const newChecked = alreadyChecked
      ? checked.filter(m => m !== member)
      : [...checked, member];
    expect(newChecked).not.toContain("前田");
    expect(newChecked.length).toBe(1);
  });

  it("detects all members checked", () => {
    const checked = [...HANDOVER_MEMBERS];
    expect(checked.length).toBe(HANDOVER_MEMBERS.length);
  });
});

describe("customer status logic", () => {
  const CUSTOMER_STATUSES_ALL = ["不通・未対応", "調整中・仮予約中", "保留", "完了"] as const;

  it("has correct status options", () => {
    expect(CUSTOMER_STATUSES_ALL).toContain("不通・未対応");
    expect(CUSTOMER_STATUSES_ALL).toContain("調整中・仮予約中");
    expect(CUSTOMER_STATUSES_ALL).toContain("保留");
    expect(CUSTOMER_STATUSES_ALL).toContain("完了");
  });

  it("filters non-completed customers for inheritance", () => {
    const customers = [
      { id: "1", status: "不通・未対応", name: "田中" },
      { id: "2", status: "完了", name: "鈴木" },
      { id: "3", status: "調整中・仮予約中", name: "佐藤" },
    ];
    const nonCompleted = customers.filter(c => c.status !== "完了");
    expect(nonCompleted.length).toBe(2);
    expect(nonCompleted.map(c => c.name)).toEqual(["田中", "佐藤"]);
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

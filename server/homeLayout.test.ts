import { describe, expect, it } from "vitest";
import { toggleAllStores, partitionHomeTasks } from "../client/src/lib/homeLayout";

describe("home task presentation", () => {
  const tasks = [
    { id: "monthly", done: false, planned: "前田", isOverdue: true },
    { id: "daily", done: true, planned: "加藤" },
    { id: "generated", done: false, planned: "加藤" },
  ];
  it("keeps every task exactly once across pending and completed, including overdue tasks", () => {
    const result = partitionHomeTasks(tasks);
    expect(result.pending.map(t => t.id)).toEqual(["monthly", "generated"]);
    expect(result.completed.map(t => t.id)).toEqual(["daily"]);
    expect(new Set([...result.pending, ...result.completed]).size).toBe(tasks.length);
  });
  it("filters presentation by selected name without changing source records", () => {
    const before = structuredClone(tasks);
    const result = partitionHomeTasks(tasks, "加藤");
    expect(result.pending.map(t => t.id)).toEqual(["generated"]);
    expect(result.completed.map(t => t.id)).toEqual(["daily"]);
    expect(tasks).toEqual(before);
    expect(partitionHomeTasks(tasks).pending).toHaveLength(2);
  });
});

describe("store bulk check isolation", () => {
  it("checks only the chosen service, preserving morning and voicemail states", () => {
    const initial = { lineMorning: ["大森南"], lineAfternoon: ["大井町", "旧店舗"], pos: [], raccoon: ["大井町"], aiVoicemail: false };
    const stores = ["大井町", "大森南"];
    const next = toggleAllStores(initial, "lineAfternoon", stores);
    expect(next).toEqual({ ...initial, lineAfternoon: ["大井町", "旧店舗", "大森南"] });
    expect(initial.lineAfternoon).toEqual(["大井町", "旧店舗"]);
    expect(toggleAllStores(next, "lineAfternoon", stores)).toEqual({ ...initial, lineAfternoon: ["旧店舗"] });
    expect(toggleAllStores(initial, "raccoon", stores)).toEqual({ ...initial, raccoon: stores });
  });
});

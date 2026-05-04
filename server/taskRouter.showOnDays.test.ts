/**
 * showOnDaysタスクの完了状態引き継ぎロジックのテスト
 *
 * バグ修正の検証:
 * 1. 翌日に表示日制限タスクのチェックが外れるバグ
 *    → 今日のstateがdone=falseで存在しても、当月中にdone=trueがあれば完了状態を優先
 * 2. 完了日が翌日の日付になるバグ
 *    → __completedDateタグが元の完了日を保持する
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// getByDateWithMonthlyのロジックをユニットテストとして抽出して検証

interface TaskState {
  dateKey: string;
  taskId: string;
  done: boolean;
  help: boolean;
  note: string | null;
}

/**
 * getByDateWithMonthlyのマージロジックを再現したヘルパー関数
 * （実際のDBクエリを使わずにロジックだけをテスト）
 */
function mergeShowOnDaysStates(params: {
  todayStates: TaskState[];
  monthlyStates: TaskState[];
  showOnDaysTaskIds: Set<string>;
  targetDateKey: string;
}): TaskState[] {
  const { todayStates, monthlyStates, showOnDaysTaskIds, targetDateKey } = params;

  const todayStateMap = new Map(todayStates.map(s => [s.taskId, s]));
  // showOnDaysタスクは後で当月完了を優先する可能性があるため別管理
  const result = todayStates.filter(s => !showOnDaysTaskIds.has(s.taskId));

  for (const taskId of Array.from(showOnDaysTaskIds)) {
    const todayState = todayStateMap.get(taskId);

    // 当月中の完了済みレコードを探す（最新日付優先）
    const monthlyCompleted = monthlyStates
      .filter(s => s.taskId === taskId && s.done)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    if (monthlyCompleted.length > 0 && (!todayState || !todayState.done)) {
      // 当月完了済みがあり、今日未完了（または未記録）の場合は当月完了を優先
      const original = monthlyCompleted[0]!;
      const completedDateTag = `__completedDate:${original.dateKey}`;
      const existingNote = original.note ?? "";
      const noteWithDate = existingNote.includes("__completedDate:")
        ? existingNote
        : existingNote
          ? `${existingNote}\n${completedDateTag}`
          : completedDateTag;
      result.push({
        ...original,
        dateKey: targetDateKey,
        note: noteWithDate,
      });
    } else if (todayState) {
      // 今日すでに完了済みの場合は今日の状態をそのまま使用
      result.push(todayState);
    }
  }

  return result;
}

describe("showOnDaysタスクの完了状態引き継ぎロジック", () => {
  const TASK_ID = "def-123";
  const showOnDaysTaskIds = new Set([TASK_ID]);

  describe("バグ修正1: 翌日にチェックが外れる問題", () => {
    it("今日のstateがdone=falseでも、当月中にdone=trueがあれば完了状態を優先する", () => {
      const todayStates: TaskState[] = [
        // 日付変更後に自動保存でdone=falseが保存されてしまったケース
        { dateKey: "2026-05-04", taskId: TASK_ID, done: false, help: false, note: "" },
      ];
      const monthlyStates: TaskState[] = [
        // 前日（5/3）に完了済み
        {
          dateKey: "2026-05-03",
          taskId: TASK_ID,
          done: true,
          help: false,
          note: "__completedDate:2026-05-03",
        },
      ];

      const result = mergeShowOnDaysStates({
        todayStates,
        monthlyStates,
        showOnDaysTaskIds,
        targetDateKey: "2026-05-04",
      });

      const taskResult = result.find(s => s.taskId === TASK_ID);
      expect(taskResult).toBeDefined();
      expect(taskResult!.done).toBe(true); // 完了状態が維持される
    });

    it("今日のstateが存在しない場合も、当月中にdone=trueがあれば完了状態を引き継ぐ", () => {
      const todayStates: TaskState[] = [];
      const monthlyStates: TaskState[] = [
        {
          dateKey: "2026-05-03",
          taskId: TASK_ID,
          done: true,
          help: false,
          note: "__completedDate:2026-05-03",
        },
      ];

      const result = mergeShowOnDaysStates({
        todayStates,
        monthlyStates,
        showOnDaysTaskIds,
        targetDateKey: "2026-05-04",
      });

      const taskResult = result.find(s => s.taskId === TASK_ID);
      expect(taskResult).toBeDefined();
      expect(taskResult!.done).toBe(true);
    });

    it("今日すでにdone=trueで保存されている場合は今日の状態を使用する", () => {
      const todayStates: TaskState[] = [
        // 今日チェックを入れた
        {
          dateKey: "2026-05-04",
          taskId: TASK_ID,
          done: true,
          help: false,
          note: "__completedDate:2026-05-04",
        },
      ];
      const monthlyStates: TaskState[] = [
        // 前日も完了済み
        {
          dateKey: "2026-05-03",
          taskId: TASK_ID,
          done: true,
          help: false,
          note: "__completedDate:2026-05-03",
        },
      ];

      const result = mergeShowOnDaysStates({
        todayStates,
        monthlyStates,
        showOnDaysTaskIds,
        targetDateKey: "2026-05-04",
      });

      const taskResult = result.find(s => s.taskId === TASK_ID);
      expect(taskResult).toBeDefined();
      expect(taskResult!.done).toBe(true);
      // 今日の状態が使われる（今日の日付のnote）
      expect(taskResult!.note).toContain("2026-05-04");
    });
  });

  describe("バグ修正2: 完了日が翌日の日付になる問題", () => {
    it("当月完了済みを引き継ぐ場合、元の完了日（__completedDate）が保持される", () => {
      const todayStates: TaskState[] = [
        // 自動保存でdone=falseが保存されたケース
        { dateKey: "2026-05-04", taskId: TASK_ID, done: false, help: false, note: "" },
      ];
      const monthlyStates: TaskState[] = [
        {
          dateKey: "2026-05-03",
          taskId: TASK_ID,
          done: true,
          help: false,
          note: "__completedDate:2026-05-03",
        },
      ];

      const result = mergeShowOnDaysStates({
        todayStates,
        monthlyStates,
        showOnDaysTaskIds,
        targetDateKey: "2026-05-04",
      });

      const taskResult = result.find(s => s.taskId === TASK_ID);
      expect(taskResult).toBeDefined();
      // noteに元の完了日（5/3）が含まれる
      expect(taskResult!.note).toContain("__completedDate:2026-05-03");
      // 翌日の日付（5/4）がcompletedDateとして入っていない
      expect(taskResult!.note).not.toContain("__completedDate:2026-05-04");
    });

    it("noteに既に__completedDateが含まれている場合は重複して追加しない", () => {
      const todayStates: TaskState[] = [];
      const monthlyStates: TaskState[] = [
        {
          dateKey: "2026-05-03",
          taskId: TASK_ID,
          done: true,
          help: false,
          note: "メモ内容\n__completedDate:2026-05-03",
        },
      ];

      const result = mergeShowOnDaysStates({
        todayStates,
        monthlyStates,
        showOnDaysTaskIds,
        targetDateKey: "2026-05-04",
      });

      const taskResult = result.find(s => s.taskId === TASK_ID);
      expect(taskResult).toBeDefined();
      // __completedDateが1つだけ含まれる
      const matches = taskResult!.note!.match(/__completedDate:/g);
      expect(matches).toHaveLength(1);
      expect(taskResult!.note).toContain("__completedDate:2026-05-03");
    });
  });

  describe("通常タスク（showOnDays未設定）への影響なし", () => {
    it("showOnDaysに含まれないタスクは今日の状態をそのまま返す", () => {
      const NORMAL_TASK_ID = "def-999";
      const todayStates: TaskState[] = [
        { dateKey: "2026-05-04", taskId: NORMAL_TASK_ID, done: false, help: false, note: "" },
      ];
      const monthlyStates: TaskState[] = [];

      const result = mergeShowOnDaysStates({
        todayStates,
        monthlyStates,
        showOnDaysTaskIds, // NORMAL_TASK_IDは含まれていない
        targetDateKey: "2026-05-04",
      });

      const taskResult = result.find(s => s.taskId === NORMAL_TASK_ID);
      expect(taskResult).toBeDefined();
      expect(taskResult!.done).toBe(false);
    });
  });
});

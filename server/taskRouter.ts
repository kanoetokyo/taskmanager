import { and, eq, gte, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import {
  customerHandovers,
  grayCellStatus,
  individualHandovers,
  misocaStatus,
  storeCheckStates,
  storesShiftStatus,
  taskDefinitions,
  taskStates,
} from "../drizzle/schema";
import { cleanupOldDateKeyRecords, getDb } from "./db";
import { publicProcedure, router } from "./_core/trpc";

// ─── Task States ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const taskStatesRouter = router({
  // Get all task states for a date
  getByDate: publicProcedure
    .input(z.object({ dateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // 3日超の古いデータをクリーンアップ（非同期・エラーは無視）
      cleanupOldDateKeyRecords().catch(() => {});
      return db.select().from(taskStates).where(eq(taskStates.dateKey, input.dateKey));
    }),

  // Get task states for a date, with monthly persistence for showOnDays tasks
  // showOnDays設定タスクは当月中に完了済みであれば、今日のdateKeyで未完了でも完了として返す
  getByDateWithMonthly: publicProcedure
    .input(z.object({ dateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      cleanupOldDateKeyRecords().catch(() => {});

      // 今日のタスク状態を取得
      const todayStates = await db.select().from(taskStates).where(eq(taskStates.dateKey, input.dateKey));

      // showOnDays設定タスクのIDリストを取得
      const showOnDaysTasks = await db
        .select({ id: taskDefinitions.id })
        .from(taskDefinitions)
        .where(and(eq(taskDefinitions.isActive, true), gte(taskDefinitions.showOnDays, "1")));

      if (showOnDaysTasks.length === 0) return todayStates;

      const showOnDaysTaskIds = new Set(showOnDaysTasks.map(t => `def-${t.id}`));

      // 当月の開始日を計算（YYYY-MM-01）
      const monthStart = input.dateKey.slice(0, 7) + "-01";

      // 当月中の全タスク状態を取得
      const monthlyStates = await db
        .select()
        .from(taskStates)
        .where(and(gte(taskStates.dateKey, monthStart), lt(taskStates.dateKey, input.dateKey)));

      // 今日の状態をベースに、showOnDaysタスクの当月完了状態でマージ
      const todayStateMap = new Map(todayStates.map(s => [s.taskId, s]));
      // 今日のレコードから開始（showOnDaysタスクは後で当月完了を優先する可能性があるため別管理）
      const result = todayStates.filter(s => !showOnDaysTaskIds.has(s.taskId));

      for (const taskId of Array.from(showOnDaysTaskIds)) {
        const todayState = todayStateMap.get(taskId);

        // 当月中の完了済みレコードを探す（最新日付優先）
        const monthlyCompleted = monthlyStates
          .filter(s => s.taskId === taskId && s.done)
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

        if (monthlyCompleted.length > 0 && (!todayState || !todayState.done)) {
          // 当月完了済みがあり、今日未完了（または未記録）の場合は当月完了を優先
          const original = monthlyCompleted[0];
          // noteフィールドに元の完了日を "__completedDate:YYYY-MM-DD" 形式で埋め追加
          const completedDateTag = `__completedDate:${original.dateKey}`;
          const existingNote = original.note ?? "";
          const noteWithDate = existingNote.includes("__completedDate:")
            ? existingNote
            : existingNote
              ? `${existingNote}\n${completedDateTag}`
              : completedDateTag;
          result.push({
            ...original,
            dateKey: input.dateKey,
            note: noteWithDate,
          });
        } else if (todayState) {
          // 今日すでに完了済みの場合は今日の状態をそのまま使用
          result.push(todayState);
        }
      }

      return result;
    }),

  // Upsert a task state
  upsert: publicProcedure
    .input(z.object({ dateKey: z.string(), taskId: z.string(), done: z.boolean(), help: z.boolean().default(false), note: z.string().default("") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db
        .insert(taskStates)
        .values({ dateKey: input.dateKey, taskId: input.taskId, done: input.done, help: input.help, note: input.note })
        .onDuplicateKeyUpdate({ set: { done: input.done, help: input.help, note: input.note } });
    }),

  // Bulk upsert task states
  bulkUpsert: publicProcedure
    .input(z.array(z.object({ dateKey: z.string(), taskId: z.string(), done: z.boolean(), help: z.boolean().default(false), note: z.string().default("") })))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db || input.length === 0) return;
      for (const item of input) {
        await db
          .insert(taskStates)
          .values({ dateKey: item.dateKey, taskId: item.taskId, done: item.done, help: item.help, note: item.note })
          .onDuplicateKeyUpdate({ set: { done: item.done, help: item.help, note: item.note } });
      }
    }),
});

// ─── Store Check States ───────────────────────────────────────────────────────
const storeCheckRouter = router({
  getByDate: publicProcedure
    .input(z.object({ dateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(storeCheckStates).where(eq(storeCheckStates.dateKey, input.dateKey));
    }),

  upsert: publicProcedure
    .input(z.object({ dateKey: z.string(), checkType: z.string(), checkedStores: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db
        .insert(storeCheckStates)
        .values({ dateKey: input.dateKey, checkType: input.checkType, checkedStores: input.checkedStores })
        .onDuplicateKeyUpdate({ set: { checkedStores: input.checkedStores } });
    }),
});


// ─── Individual Handovers (個別引き継ぎ) ──────────────────────────────────────
const individualHandoverRouter = router({
  // Get all incomplete + today's records
  getActive: publicProcedure
    .input(z.object({ dateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get all non-completed records (carries over) + today's records
      const all = await db.select().from(individualHandovers).where(eq(individualHandovers.completed, false));
      return all;
    }),

  upsert: publicProcedure
    .input(z.object({
      id: z.string(),
      dateKey: z.string(),
      author: z.string(),
      target: z.string(),
      tasks: z.array(z.object({
        id: z.string(),
        content: z.string(),
        done: z.boolean(),
        deadline: z.string().optional(),
      })),
      completed: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db
        .insert(individualHandovers)
        .values(input)
        .onDuplicateKeyUpdate({ set: { author: input.author, target: input.target, tasks: input.tasks, completed: input.completed } });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db.delete(individualHandovers).where(eq(individualHandovers.id, input.id));
    }),
});

// ─── Customer Handovers (顧客引き継ぎ) ───────────────────────────────────────
const customerHandoverRouter = router({
  getActive: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // 「完了」ステータスのレコードをDBから自動削除してから返す
    await db.delete(customerHandovers).where(eq(customerHandovers.status, "完了"));
    return db.select().from(customerHandovers);
  }),

  upsert: publicProcedure
    .input(z.object({
      id: z.string(),
      dateKey: z.string(),
      customerName: z.string(),
      store: z.string(),
      content: z.string(),
      status: z.string(),
      assignee: z.string(),
      links: z.array(z.string()).max(4).optional(),
      dueDate: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      // 「完了」ステータスのupsertは受け付けず即座に削除する
      if (input.status === "完了") {
        await db.delete(customerHandovers).where(eq(customerHandovers.id, input.id));
        return;
      }
      const links = input.links ?? [];
      const dueDate = input.dueDate ?? null;
      await db
        .insert(customerHandovers)
        .values({ ...input, links, dueDate })
        .onDuplicateKeyUpdate({ set: { customerName: input.customerName, store: input.store, content: input.content, status: input.status, assignee: input.assignee, links, dueDate } });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db.delete(customerHandovers).where(eq(customerHandovers.id, input.id));
    }),
});

// ─── MISOCA Status ────────────────────────────────────────────────────────────
const misocaRouter = router({
  get: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(misocaStatus).limit(1);
    return result[0] ?? null;
  }),

  upsert: publicProcedure
    .input(z.object({ completedUntil: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      const existing = await db.select().from(misocaStatus).limit(1);
      if (existing.length > 0) {
        await db.update(misocaStatus).set({ completedUntil: input.completedUntil });
      } else {
        await db.insert(misocaStatus).values({ completedUntil: input.completedUntil });
      }
    }),
});

// ─── Gray Cell Status Router ────────────────────────────────────────────────────
const grayCellRouter = router({
  get: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(grayCellStatus).limit(1);
    return result[0] ?? null;
  }),

  upsert: publicProcedure
    .input(z.object({ confirmedUntil: z.string(), updatedBy: z.string().default("") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      const existing = await db.select().from(grayCellStatus).limit(1);
      if (existing.length > 0) {
        await db.update(grayCellStatus).set({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy });
      } else {
        await db.insert(grayCellStatus).values({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy });
      }
    }),
});

// ─── STORES Shift Status Router ──────────────────────────────────────────────────
const storesShiftRouter = router({
  get: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select().from(storesShiftStatus).limit(1);
    return result[0] ?? null;
  }),

  upsert: publicProcedure
    .input(z.object({ confirmedUntil: z.string(), updatedBy: z.string().default("") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      const existing = await db.select().from(storesShiftStatus).limit(1);
      if (existing.length > 0) {
        await db.update(storesShiftStatus).set({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy });
      } else {
        await db.insert(storesShiftStatus).values({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy });
      }
    }),
});

// ─── Main Task Router ─────────────────────────────────────────────────────
export const taskRouter = router({
  taskStates: taskStatesRouter,
  storeCheck: storeCheckRouter,
  individualHandover: individualHandoverRouter,
  customerHandover: customerHandoverRouter,
  misoca: misocaRouter,
  grayCell: grayCellRouter,
  storesShift: storesShiftRouter,
});

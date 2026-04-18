/**
 * タスク定義マスタ管理ルーター
 * - getAll: カテゴリ＋タスク定義を一括取得
 * - addCategory: カテゴリ追加
 * - updateCategory: カテゴリ名変更
 * - deleteCategory: カテゴリ削除（配下のタスクも論理削除）
 * - reorderCategories: カテゴリ並び替え
 * - addTask: タスク追加
 * - updateTask: タスク編集（ラベル・担当者・期限）
 * - deleteTask: タスク論理削除
 * - reorderTasks: タスク並び替え
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { taskCategories, taskDefinitions, TaskCategory, TaskDefinition } from "../drizzle/schema";
import { eq, asc, and } from "drizzle-orm";

export const taskDefinitionRouter = router({
  // カテゴリ一覧＋各カテゴリのタスク定義を取得
  getAll: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const categories: TaskCategory[] = await db
      .select()
      .from(taskCategories)
      .where(eq(taskCategories.isActive, true))
      .orderBy(asc(taskCategories.sortOrder));

    const definitions: TaskDefinition[] = await db
      .select()
      .from(taskDefinitions)
      .where(eq(taskDefinitions.isActive, true))
      .orderBy(asc(taskDefinitions.sortOrder));

    return categories.map((cat: TaskCategory) => ({
      ...cat,
      tasks: definitions.filter((d: TaskDefinition) => d.categoryId === cat.id),
    }));
  }),

  // ─── カテゴリ管理 ────────────────────────────────────────────────────────

  // カテゴリ追加
  addCategory: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const existing: TaskCategory[] = await db
        .select()
        .from(taskCategories)
        .where(eq(taskCategories.isActive, true))
        .orderBy(asc(taskCategories.sortOrder));
      const maxSort = existing.length > 0 ? existing[existing.length - 1].sortOrder + 1 : 0;
      const [result] = await db.insert(taskCategories).values({
        name: input.name,
        sortOrder: maxSort,
        isActive: true,
      });
      return { id: (result as any).insertId };
    }),

  // カテゴリ名変更
  updateCategory: publicProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db
        .update(taskCategories)
        .set({ name: input.name })
        .where(eq(taskCategories.id, input.id));
      return { success: true };
    }),

  // カテゴリ削除（配下のタスクも論理削除）
  deleteCategory: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db
        .update(taskDefinitions)
        .set({ isActive: false })
        .where(eq(taskDefinitions.categoryId, input.id));
      await db
        .update(taskCategories)
        .set({ isActive: false })
        .where(eq(taskCategories.id, input.id));
      return { success: true };
    }),

  // カテゴリ並び替え（sortOrderを一括更新）
  reorderCategories: publicProcedure
    .input(
      z.object({
        categories: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await Promise.all(
        input.categories.map(({ id, sortOrder }) =>
          db
            .update(taskCategories)
            .set({ sortOrder })
            .where(eq(taskCategories.id, id))
        )
      );
      return { success: true };
    }),

  // ─── タスク管理 ────────────────────────────────────────────────────────

  // タスク追加
  addTask: publicProcedure
    .input(
      z.object({
        categoryId: z.number(),
        label: z.string().min(1).max(512),
        defaultPlanned: z.string().max(64).default("当日事務担当"),
        deadline: z.string().max(64).default(""),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // 同カテゴリの最大sortOrderを取得
      const existing: TaskDefinition[] = await db
        .select()
        .from(taskDefinitions)
        .where(
          and(
            eq(taskDefinitions.categoryId, input.categoryId),
            eq(taskDefinitions.isActive, true)
          )
        )
        .orderBy(asc(taskDefinitions.sortOrder));

      const maxSort = existing.length > 0 ? existing[existing.length - 1].sortOrder + 1 : 0;

      const [result] = await db.insert(taskDefinitions).values({
        categoryId: input.categoryId,
        label: input.label,
        defaultPlanned: input.defaultPlanned,
        deadline: input.deadline,
        sortOrder: maxSort,
        isActive: true,
      });

      return { id: (result as any).insertId };
    }),

  // タスク編集
  updateTask: publicProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().min(1).max(512).optional(),
        defaultPlanned: z.string().max(64).optional(),
        deadline: z.string().max(64).optional(),
        showOnDays: z.string().max(128).optional(), // 例: "15,30" = 毎月15日・30日のみ。空文字列 = 常時表示
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const { id, ...updates } = input;
      await db
        .update(taskDefinitions)
        .set(updates)
        .where(eq(taskDefinitions.id, id));
      return { success: true };
    }),

  // タスク論理削除
  deleteTask: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db
        .update(taskDefinitions)
        .set({ isActive: false })
        .where(eq(taskDefinitions.id, input.id));
      return { success: true };
    }),

  // タスク並び替え（同カテゴリ内のsortOrderを一括更新）
  reorderTasks: publicProcedure
    .input(
      z.object({
        // [{id, sortOrder}] の配列
        tasks: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await Promise.all(
        input.tasks.map(({ id, sortOrder }) =>
          db
            .update(taskDefinitions)
            .set({ sortOrder })
            .where(eq(taskDefinitions.id, id))
        )
      );
      return { success: true };
    }),
});

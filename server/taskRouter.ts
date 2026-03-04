import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  customerHandovers,
  grayCellStatus,
  handoverItems,
  individualHandovers,
  misocaStatus,
  storeCheckStates,
  storesShiftStatus,
  taskStates,
} from "../drizzle/schema";
import { getDb } from "./db";
import { publicProcedure, router } from "./_core/trpc";

// ─── Task States ──────────────────────────────────────────────────────────────
const taskStatesRouter = router({
  // Get all task states for a date
  getByDate: publicProcedure
    .input(z.object({ dateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(taskStates).where(eq(taskStates.dateKey, input.dateKey));
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

// ─── Handover Items (全体引き継ぎ) ────────────────────────────────────────────
const handoverRouter = router({
  getByDate: publicProcedure
    .input(z.object({ dateKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(handoverItems).where(eq(handoverItems.dateKey, input.dateKey));
    }),

  upsert: publicProcedure
    .input(z.object({
      id: z.string(),
      dateKey: z.string(),
      author: z.string(),
      content: z.string(),
      checkedMembers: z.array(z.string()),
      noConfirmationRequired: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db
        .insert(handoverItems)
        .values(input)
        .onDuplicateKeyUpdate({
          set: {
            author: input.author,
            content: input.content,
            checkedMembers: input.checkedMembers,
            noConfirmationRequired: input.noConfirmationRequired,
          },
        });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db.delete(handoverItems).where(eq(handoverItems.id, input.id));
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
    // Return all non-completed customers (carries over day to day)
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
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db
        .insert(customerHandovers)
        .values(input)
        .onDuplicateKeyUpdate({ set: { customerName: input.customerName, store: input.store, content: input.content, status: input.status, assignee: input.assignee } });
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
  handover: handoverRouter,
  individualHandover: individualHandoverRouter,
  customerHandover: customerHandoverRouter,
  misoca: misocaRouter,
  grayCell: grayCellRouter,
  storesShift: storesShiftRouter,
});

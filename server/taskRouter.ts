import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  auditLogs,
  customerHandovers,
  grayCellStatus,
  individualHandovers,
  misocaStatus,
  storeCheckStates,
  storesShiftStatus,
  taskDefinitions,
  taskStates,
} from "../drizzle/schema";
import { getDb } from "./db";
import { appAdminProcedure, appProcedure, router } from "./_core/trpc";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type AuditActor = { actorId: string; requestId: string | null };

const expectedRevision = z.number().int().positive().nullable().optional();
const requestIdInput = z.string().max(128).optional();

async function requireDb(): Promise<Database> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "データベースに接続できません。データは変更されていません。",
    });
  }
  return db;
}

function getAuditActor(ctx: { user: { openId: string } | null; req: { headers?: Record<string, string | string[] | undefined> } }, requestId?: string): AuditActor {
  const header = ctx.req.headers?.["x-request-id"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  return { actorId: ctx.user?.openId ?? "legacy-unauthenticated", requestId: requestId ?? headerValue ?? null };
}

function conflictError() {
  return new TRPCError({
    code: "CONFLICT",
    message: "他の端末で先に更新されています。最新データを確認してから再試行してください。",
  });
}

function notFoundError() {
  return new TRPCError({ code: "NOT_FOUND", message: "対象データが見つかりません。" });
}

async function writeAudit(
  tx: any,
  actor: AuditActor,
  entityType: string,
  entityId: string | number,
  action: string,
  before: unknown,
  after: unknown
) {
  await tx.insert(auditLogs).values({
    entityType,
    entityId: String(entityId),
    action,
    before,
    after,
    actorId: actor.actorId,
    requestId: actor.requestId,
  });
}

function assertExpectedRevision(currentRevision: number, expected?: number | null) {
  if (expected == null || expected !== currentRevision) throw conflictError();
}

const taskStateInput = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskId: z.string().min(1).max(128),
  done: z.boolean(),
  help: z.boolean().default(false),
  note: z.string().max(1024).default(""),
  planned: z.string().max(64).default(""),
  expectedRevision,
  requestId: requestIdInput,
});

async function saveTaskState(tx: any, input: z.infer<typeof taskStateInput>, actor: AuditActor) {
  const current = await tx
    .select()
    .from(taskStates)
    .where(and(eq(taskStates.dateKey, input.dateKey), eq(taskStates.taskId, input.taskId)))
    .limit(1);

  if (current.length === 0) {
    if (input.expectedRevision != null) throw conflictError();
    const [created] = await tx
      .insert(taskStates)
      .values({
        dateKey: input.dateKey,
        taskId: input.taskId,
        done: input.done,
        help: input.help,
        note: input.note,
        planned: input.planned,
        revision: 1,
      })
      .returning();
    await writeAudit(tx, actor, "task_state", `${input.dateKey}:${input.taskId}`, "create", null, created);
    return created;
  }

  const previous = current[0];
  assertExpectedRevision(previous.revision, input.expectedRevision);
  const [updated] = await tx
    .update(taskStates)
    .set({
      done: input.done,
      help: input.help,
      note: input.note,
      planned: input.planned,
      revision: previous.revision + 1,
    })
    .where(
      and(
        eq(taskStates.dateKey, input.dateKey),
        eq(taskStates.taskId, input.taskId),
        eq(taskStates.revision, input.expectedRevision!)
      )
    )
    .returning();
  if (!updated) throw conflictError();
  await writeAudit(tx, actor, "task_state", `${input.dateKey}:${input.taskId}`, "update", previous, updated);
  return updated;
}

const taskStatesRouter = router({
  getByDate: appProcedure
    .input(z.object({ dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(taskStates).where(eq(taskStates.dateKey, input.dateKey));
    }),

  getByDateWithMonthly: appProcedure
    .input(z.object({ dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const todayStates = await db.select().from(taskStates).where(eq(taskStates.dateKey, input.dateKey));
      const showOnDaysTasks = await db
        .select({ id: taskDefinitions.id })
        .from(taskDefinitions)
        .where(and(eq(taskDefinitions.isActive, true), gte(taskDefinitions.showOnDays, "1")));

      if (showOnDaysTasks.length === 0) return todayStates;

      const showOnDaysTaskIds = new Set(showOnDaysTasks.map(t => `def-${t.id}`));
      const monthStart = `${input.dateKey.slice(0, 7)}-01`;
      const monthlyStates = await db
        .select()
        .from(taskStates)
        .where(and(gte(taskStates.dateKey, monthStart), lte(taskStates.dateKey, input.dateKey)));

      const todayStateMap = new Map(todayStates.map(s => [s.taskId, s]));
      const result = todayStates.filter(s => !showOnDaysTaskIds.has(s.taskId));

      for (const taskId of Array.from(showOnDaysTaskIds)) {
        const todayState = todayStateMap.get(taskId);
        const monthlyCompleted = monthlyStates
          .filter(s => s.taskId === taskId && s.done)
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

        if (monthlyCompleted.length > 0 && (!todayState || !todayState.done)) {
          const original = monthlyCompleted[0];
          const completedDateTag = `__completedDate:${original.dateKey}`;
          const existingNote = original.note ?? "";
          result.push({
            ...original,
            dateKey: input.dateKey,
            // This row is synthesized for display. It has no current-date database
            // row, so clients must create rather than overwrite the older record.
            revision: 0,
            note: existingNote.includes("__completedDate:")
              ? existingNote
              : existingNote
                ? `${existingNote}\n${completedDateTag}`
                : completedDateTag,
          });
          continue;
        }

        if (!todayState) continue;
        const todayNote = todayState.note ?? "";
        const hasCompletedDateTag = todayNote.includes("__completedDate:");
        const taggedCompletion = monthlyCompleted.find(s => s.note?.includes("__completedDate:"));
        if (!hasCompletedDateTag && taggedCompletion) {
          const completedDateTag = `__completedDate:${taggedCompletion.dateKey}`;
          const completedByMatch = (taggedCompletion.note ?? "").match(/__completedBy:([^\n]+)/);
          const completedByTag = completedByMatch ? `\n__completedBy:${completedByMatch[1].trim()}` : "";
          const cleanTodayNote = todayNote
            .replace(/\n?__completedDate:\d{4}-\d{2}-\d{2}/g, "")
            .replace(/\n?__completedBy:[^\n]+/g, "")
            .trim();
          result.push({
            ...todayState,
            note: cleanTodayNote
              ? `${cleanTodayNote}\n${completedDateTag}${completedByTag}`
              : `${completedDateTag}${completedByTag}`,
          });
        } else {
          result.push(todayState);
        }
      }

      return result;
    }),

  upsert: appProcedure.input(taskStateInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    return db.transaction(tx => saveTaskState(tx, input, getAuditActor(ctx, input.requestId)));
  }),

  bulkUpsert: appProcedure.input(z.array(taskStateInput).min(1)).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    return db.transaction(async tx => {
      const saved = [];
      for (const item of input) {
        saved.push(await saveTaskState(tx, item, getAuditActor(ctx, item.requestId)));
      }
      return saved;
    });
  }),
});

const storeCheckInput = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkType: z.string().min(1).max(32),
  checkedStores: z.array(z.string()),
  expectedRevision,
  requestId: requestIdInput,
});

async function saveStoreCheck(tx: any, input: z.infer<typeof storeCheckInput>, actor: AuditActor) {
  const current = await tx
    .select()
    .from(storeCheckStates)
    .where(and(eq(storeCheckStates.dateKey, input.dateKey), eq(storeCheckStates.checkType, input.checkType)))
    .limit(1);
  if (current.length === 0) {
    if (input.expectedRevision != null) throw conflictError();
    const [created] = await tx
      .insert(storeCheckStates)
      .values({ dateKey: input.dateKey, checkType: input.checkType, checkedStores: input.checkedStores, revision: 1 })
      .returning();
    await writeAudit(tx, actor, "store_check", `${input.dateKey}:${input.checkType}`, "create", null, created);
    return created;
  }

  const previous = current[0];
  assertExpectedRevision(previous.revision, input.expectedRevision);
  const [updated] = await tx
    .update(storeCheckStates)
    .set({ checkedStores: input.checkedStores, revision: previous.revision + 1 })
    .where(
      and(
        eq(storeCheckStates.dateKey, input.dateKey),
        eq(storeCheckStates.checkType, input.checkType),
        eq(storeCheckStates.revision, input.expectedRevision!)
      )
    )
    .returning();
  if (!updated) throw conflictError();
  await writeAudit(tx, actor, "store_check", `${input.dateKey}:${input.checkType}`, "update", previous, updated);
  return updated;
}

const storeCheckRouter = router({
  getByDate: appProcedure
    .input(z.object({ dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(storeCheckStates).where(eq(storeCheckStates.dateKey, input.dateKey));
    }),

  upsert: appProcedure.input(storeCheckInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    return db.transaction(tx => saveStoreCheck(tx, input, getAuditActor(ctx, input.requestId)));
  }),

  bulkUpsert: appProcedure.input(z.array(storeCheckInput).min(1)).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    return db.transaction(async tx => {
      const saved = [];
      for (const item of input) saved.push(await saveStoreCheck(tx, item, getAuditActor(ctx, item.requestId)));
      return saved;
    });
  }),
});

const individualInput = z.object({
  id: z.string().min(1).max(64),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  author: z.string().max(64),
  target: z.string().max(64),
  tasks: z.array(z.object({ id: z.string(), content: z.string(), done: z.boolean(), deadline: z.string().optional() })),
  completed: z.boolean(),
  important: z.boolean().optional().default(false),
  expectedRevision,
  requestId: requestIdInput,
});

const individualHandoverRouter = router({
  getActive: appProcedure
    .input(z.object({ dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async () => {
      const db = await requireDb();
      return db
        .select()
        .from(individualHandovers)
        .where(and(eq(individualHandovers.completed, false), isNull(individualHandovers.deletedAt)));
    }),

  upsert: appProcedure.input(individualInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const actor = getAuditActor(ctx, input.requestId);
    return db.transaction(async tx => {
      const current = await tx.select().from(individualHandovers).where(eq(individualHandovers.id, input.id)).limit(1);
      const now = new Date();
      if (current.length === 0) {
        if (input.expectedRevision != null) throw conflictError();
        const [created] = await tx
          .insert(individualHandovers)
          .values({
            id: input.id,
            dateKey: input.dateKey,
            author: input.author,
            target: input.target,
            tasks: input.tasks,
            completed: input.completed,
            completedAt: input.completed ? now : null,
            important: input.important,
            updatedBy: actor.actorId,
            revision: 1,
          })
          .returning();
        await writeAudit(tx, actor, "individual_handover", input.id, input.completed ? "complete" : "create", null, created);
        return created;
      }

      const previous = current[0];
      if (previous.deletedAt) throw notFoundError();
      assertExpectedRevision(previous.revision, input.expectedRevision);
      const [updated] = await tx
        .update(individualHandovers)
        .set({
          author: input.author,
          target: input.target,
          tasks: input.tasks,
          completed: input.completed,
          completedAt: input.completed ? previous.completedAt ?? now : null,
          important: input.important,
          updatedBy: actor.actorId,
          revision: previous.revision + 1,
        })
        .where(and(eq(individualHandovers.id, input.id), eq(individualHandovers.revision, input.expectedRevision!)))
        .returning();
      if (!updated) throw conflictError();
      await writeAudit(tx, actor, "individual_handover", input.id, input.completed ? "complete" : "update", previous, updated);
      return updated;
    });
  }),

  delete: appProcedure
    .input(z.object({ id: z.string(), expectedRevision: z.number().int().positive(), requestId: requestIdInput }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = getAuditActor(ctx, input.requestId);
      return db.transaction(async tx => {
        const [previous] = await tx.select().from(individualHandovers).where(eq(individualHandovers.id, input.id)).limit(1);
        if (!previous) throw notFoundError();
        assertExpectedRevision(previous.revision, input.expectedRevision);
        const [updated] = await tx
          .update(individualHandovers)
          .set({ deletedAt: new Date(), updatedBy: actor.actorId, revision: previous.revision + 1 })
          .where(and(eq(individualHandovers.id, input.id), eq(individualHandovers.revision, input.expectedRevision)))
          .returning();
        if (!updated) throw conflictError();
        await writeAudit(tx, actor, "individual_handover", input.id, "soft_delete", previous, updated);
        return updated;
      });
    }),

  restore: appProcedure
    .input(z.object({ id: z.string(), expectedRevision: z.number().int().positive(), requestId: requestIdInput }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = getAuditActor(ctx, input.requestId);
      return db.transaction(async tx => {
        const [previous] = await tx.select().from(individualHandovers).where(eq(individualHandovers.id, input.id)).limit(1);
        if (!previous) throw notFoundError();
        assertExpectedRevision(previous.revision, input.expectedRevision);
        const [updated] = await tx
          .update(individualHandovers)
          .set({ deletedAt: null, completed: false, completedAt: null, updatedBy: actor.actorId, revision: previous.revision + 1 })
          .where(and(eq(individualHandovers.id, input.id), eq(individualHandovers.revision, input.expectedRevision)))
          .returning();
        if (!updated) throw conflictError();
        await writeAudit(tx, actor, "individual_handover", input.id, "restore", previous, updated);
        return updated;
      });
    }),

  hardDelete: appAdminProcedure.input(z.object({ id: z.string(), requestId: requestIdInput })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const actor = getAuditActor(ctx, input.requestId);
    return db.transaction(async tx => {
      const [previous] = await tx.select().from(individualHandovers).where(eq(individualHandovers.id, input.id)).limit(1);
      if (!previous) throw notFoundError();
      await tx.delete(individualHandovers).where(eq(individualHandovers.id, input.id));
      await writeAudit(tx, actor, "individual_handover", input.id, "hard_delete", previous, null);
      return { success: true };
    });
  }),
});

const customerInput = z.object({
  id: z.string().min(1).max(64),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerName: z.string().max(128),
  store: z.string().max(64),
  content: z.string().max(2048),
  status: z.string().max(32),
  assignee: z.string().max(64),
  links: z.array(z.string()).max(4).optional(),
  dueDate: z.number().nullable().optional(),
  callCount: z.number().int().min(0).max(2).optional(),
  expectedRevision,
  requestId: requestIdInput,
});

const customerPatchInput = z.object({
  id: z.string().min(1).max(64),
  expectedRevision: z.number().int().positive(),
  customerName: z.string().max(128).optional(),
  store: z.string().max(64).optional(),
  content: z.string().max(2048).optional(),
  status: z.string().max(32).optional(),
  assignee: z.string().max(64).optional(),
  links: z.array(z.string()).max(4).optional(),
  dueDate: z.number().nullable().optional(),
  callCount: z.number().int().min(0).max(2).optional(),
  requestId: requestIdInput,
});

const customerHandoverRouter = router({
  getActive: appProcedure.query(async () => {
    const db = await requireDb();
    return db
      .select()
      .from(customerHandovers)
      .where(and(isNull(customerHandovers.deletedAt), ne(customerHandovers.status, "完了")));
  }),

  upsert: appProcedure.input(customerInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const actor = getAuditActor(ctx, input.requestId);
    return db.transaction(async tx => {
      const current = await tx.select().from(customerHandovers).where(eq(customerHandovers.id, input.id)).limit(1);
      const now = new Date();
      const links = input.links ?? [];
      const dueDate = input.dueDate ?? null;
      const callCount = input.callCount ?? 0;
      if (current.length === 0) {
        if (input.expectedRevision != null) throw conflictError();
        const [created] = await tx
          .insert(customerHandovers)
          .values({ ...input, links, dueDate, callCount, completedAt: input.status === "完了" ? now : null, updatedBy: actor.actorId, revision: 1 })
          .returning();
        await writeAudit(tx, actor, "customer_handover", input.id, input.status === "完了" ? "complete" : "create", null, created);
        return created;
      }

      const previous = current[0];
      if (previous.deletedAt) throw notFoundError();
      assertExpectedRevision(previous.revision, input.expectedRevision);
      const [updated] = await tx
        .update(customerHandovers)
        .set({
          customerName: input.customerName,
          store: input.store,
          content: input.content,
          status: input.status,
          assignee: input.assignee,
          links,
          dueDate,
          callCount,
          completedAt: input.status === "完了" ? previous.completedAt ?? now : null,
          updatedBy: actor.actorId,
          revision: previous.revision + 1,
        })
        .where(and(eq(customerHandovers.id, input.id), eq(customerHandovers.revision, input.expectedRevision!)))
        .returning();
      if (!updated) throw conflictError();
      await writeAudit(tx, actor, "customer_handover", input.id, input.status === "完了" ? "complete" : "update", previous, updated);
      return updated;
    });
  }),

  patch: appProcedure.input(customerPatchInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const actor = getAuditActor(ctx, input.requestId);
    return db.transaction(async tx => {
      const [previous] = await tx.select().from(customerHandovers).where(eq(customerHandovers.id, input.id)).limit(1);
      if (!previous || previous.deletedAt) throw notFoundError();
      assertExpectedRevision(previous.revision, input.expectedRevision);
      const updates: Record<string, unknown> = {};
      for (const key of ["customerName", "store", "content", "status", "assignee", "links", "dueDate", "callCount"] as const) {
        if (input[key] !== undefined) updates[key] = input[key];
      }
      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "更新する項目がありません。" });
      }
      if (updates.status === "完了" && !previous.completedAt) updates.completedAt = new Date();
      if (updates.status !== undefined && updates.status !== "完了") updates.completedAt = null;
      updates.updatedBy = actor.actorId;
      updates.revision = previous.revision + 1;
      const [updated] = await tx
        .update(customerHandovers)
        .set(updates as any)
        .where(and(eq(customerHandovers.id, input.id), eq(customerHandovers.revision, input.expectedRevision)))
        .returning();
      if (!updated) throw conflictError();
      await writeAudit(tx, actor, "customer_handover", input.id, updates.status === "完了" ? "complete" : "update", previous, updated);
      return updated;
    });
  }),

  delete: appProcedure
    .input(z.object({ id: z.string(), expectedRevision: z.number().int().positive(), requestId: requestIdInput }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = getAuditActor(ctx, input.requestId);
      return db.transaction(async tx => {
        const [previous] = await tx.select().from(customerHandovers).where(eq(customerHandovers.id, input.id)).limit(1);
        if (!previous) throw notFoundError();
        assertExpectedRevision(previous.revision, input.expectedRevision);
        const [updated] = await tx
          .update(customerHandovers)
          .set({ deletedAt: new Date(), updatedBy: actor.actorId, revision: previous.revision + 1 })
          .where(and(eq(customerHandovers.id, input.id), eq(customerHandovers.revision, input.expectedRevision)))
          .returning();
        if (!updated) throw conflictError();
        await writeAudit(tx, actor, "customer_handover", input.id, "soft_delete", previous, updated);
        return updated;
      });
    }),

  restore: appProcedure
    .input(z.object({ id: z.string(), expectedRevision: z.number().int().positive(), status: z.string().max(32).optional(), requestId: requestIdInput }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const actor = getAuditActor(ctx, input.requestId);
      return db.transaction(async tx => {
        const [previous] = await tx.select().from(customerHandovers).where(eq(customerHandovers.id, input.id)).limit(1);
        if (!previous) throw notFoundError();
        assertExpectedRevision(previous.revision, input.expectedRevision);
        const status = input.status ?? previous.status;
        const [updated] = await tx
          .update(customerHandovers)
          .set({
            deletedAt: null,
            status,
            completedAt: status === "完了" ? previous.completedAt : null,
            updatedBy: actor.actorId,
            revision: previous.revision + 1,
          })
          .where(and(eq(customerHandovers.id, input.id), eq(customerHandovers.revision, input.expectedRevision)))
          .returning();
        if (!updated) throw conflictError();
        await writeAudit(tx, actor, "customer_handover", input.id, "restore", previous, updated);
        return updated;
      });
    }),

  hardDelete: appAdminProcedure.input(z.object({ id: z.string(), requestId: requestIdInput })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const actor = getAuditActor(ctx, input.requestId);
    return db.transaction(async tx => {
      const [previous] = await tx.select().from(customerHandovers).where(eq(customerHandovers.id, input.id)).limit(1);
      if (!previous) throw notFoundError();
      await tx.delete(customerHandovers).where(eq(customerHandovers.id, input.id));
      await writeAudit(tx, actor, "customer_handover", input.id, "hard_delete", previous, null);
      return { success: true };
    });
  }),
});

const simpleStatusInput = z.object({ value: z.string().max(16), requestId: requestIdInput });

async function upsertSingletonStatus(
  db: Database,
  table: any,
  field: "completedUntil" | "confirmedUntil",
  value: string,
  actor: AuditActor,
  entityType: string
) {
  return db.transaction(async tx => {
    const existing = await tx.select().from(table).limit(1);
    if (existing.length > 0) {
      const previous = existing[0];
      const [updated] = await tx.update(table).set({ [field]: value }).where(eq(table.id, previous.id)).returning();
      await writeAudit(tx, actor, entityType, previous.id, "update", previous, updated);
      return updated;
    }
    const [created] = await tx.insert(table).values({ [field]: value }).returning();
    await writeAudit(tx, actor, entityType, created.id, "create", null, created);
    return created;
  });
}

const misocaRouter = router({
  get: appProcedure.query(async () => {
    const db = await requireDb();
    const result = await db.select().from(misocaStatus).limit(1);
    return result[0] ?? null;
  }),
  upsert: appProcedure.input(z.object({ completedUntil: z.string().max(16), requestId: requestIdInput })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    return upsertSingletonStatus(db, misocaStatus, "completedUntil", input.completedUntil, getAuditActor(ctx, input.requestId), "misoca_status");
  }),
});

const grayCellRouter = router({
  get: appProcedure.query(async () => {
    const db = await requireDb();
    const result = await db.select().from(grayCellStatus).limit(1);
    return result[0] ?? null;
  }),
  upsert: appProcedure.input(z.object({ confirmedUntil: z.string().max(16), updatedBy: z.string().max(64).default(""), requestId: requestIdInput })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    return db.transaction(async tx => {
      const existing = await tx.select().from(grayCellStatus).limit(1);
      const actor = getAuditActor(ctx, input.requestId);
      if (existing.length > 0) {
        const previous = existing[0];
        const [updated] = await tx.update(grayCellStatus).set({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy }).where(eq(grayCellStatus.id, previous.id)).returning();
        await writeAudit(tx, actor, "gray_cell_status", previous.id, "update", previous, updated);
        return updated;
      }
      const [created] = await tx.insert(grayCellStatus).values({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy }).returning();
      await writeAudit(tx, actor, "gray_cell_status", created.id, "create", null, created);
      return created;
    });
  }),
});

const storesShiftRouter = router({
  get: appProcedure.query(async () => {
    const db = await requireDb();
    const result = await db.select().from(storesShiftStatus).limit(1);
    return result[0] ?? null;
  }),
  upsert: appProcedure.input(z.object({ confirmedUntil: z.string().max(16), updatedBy: z.string().max(64).default(""), requestId: requestIdInput })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    return db.transaction(async tx => {
      const existing = await tx.select().from(storesShiftStatus).limit(1);
      const actor = getAuditActor(ctx, input.requestId);
      if (existing.length > 0) {
        const previous = existing[0];
        const [updated] = await tx.update(storesShiftStatus).set({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy }).where(eq(storesShiftStatus.id, previous.id)).returning();
        await writeAudit(tx, actor, "stores_shift_status", previous.id, "update", previous, updated);
        return updated;
      }
      const [created] = await tx.insert(storesShiftStatus).values({ confirmedUntil: input.confirmedUntil, updatedBy: input.updatedBy }).returning();
      await writeAudit(tx, actor, "stores_shift_status", created.id, "create", null, created);
      return created;
    });
  }),
});

export const taskRouter = router({
  taskStates: taskStatesRouter,
  storeCheck: storeCheckRouter,
  individualHandover: individualHandoverRouter,
  customerHandover: customerHandoverRouter,
  misoca: misocaRouter,
  grayCell: grayCellRouter,
  storesShift: storesShiftRouter,
});

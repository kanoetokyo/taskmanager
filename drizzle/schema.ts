import { boolean, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

// ─── Task States (per date) ────────────────────────────────────────────────
export const taskStates = mysqlTable("task_states", {
  id: int("id").autoincrement().primaryKey(),
  dateKey: varchar("dateKey", { length: 10 }).notNull(),
  taskId: varchar("taskId", { length: 128 }).notNull(),
  done: boolean("done").default(false).notNull(),
  help: boolean("help").default(false).notNull(),
  note: varchar("note", { length: 1024 }).notNull().default(""),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  dateKeyTaskIdIdx: uniqueIndex("task_states_date_task_unique").on(table.dateKey, table.taskId),
}));
export type TaskState = typeof taskStates.$inferSelect;
export type InsertTaskState = typeof taskStates.$inferInsert;

// ─── Store Check States (per date) ────────────────────────────────────────
export const storeCheckStates = mysqlTable("store_check_states", {
  id: int("id").autoincrement().primaryKey(),
  dateKey: varchar("dateKey", { length: 10 }).notNull(),
  checkType: varchar("checkType", { length: 32 }).notNull(),
  checkedStores: json("checkedStores").notNull().$type<string[]>().default([]),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  dateKeyCheckTypeIdx: uniqueIndex("store_check_states_date_type_unique").on(table.dateKey, table.checkType),
}));
export type StoreCheckState = typeof storeCheckStates.$inferSelect;
export type InsertStoreCheckState = typeof storeCheckStates.$inferInsert;

// ─── Handover Items (全体引き継ぎ, per date) ──────────────────────────────
export const handoverItems = mysqlTable("handover_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dateKey: varchar("dateKey", { length: 10 }).notNull(),
  author: varchar("author", { length: 64 }).notNull().default(""),
  content: varchar("content", { length: 2048 }).notNull().default(""),
  checkedMembers: json("checkedMembers").notNull().$type<string[]>().default([]),
  noConfirmationRequired: boolean("noConfirmationRequired").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type HandoverItem = typeof handoverItems.$inferSelect;
export type InsertHandoverItem = typeof handoverItems.$inferInsert;

// ─── Individual Handover Records (個別引き継ぎ) ───────────────────────────
export const individualHandovers = mysqlTable("individual_handovers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dateKey: varchar("dateKey", { length: 10 }).notNull(),
  author: varchar("author", { length: 64 }).notNull().default(""),
  target: varchar("target", { length: 64 }).notNull().default(""),
  tasks: json("tasks").notNull().$type<Array<{ id: string; content: string; done: boolean; deadline?: string }>>().default([]),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type IndividualHandover = typeof individualHandovers.$inferSelect;
export type InsertIndividualHandover = typeof individualHandovers.$inferInsert;

// ─── Customer Handover Records (顧客引き継ぎ) ─────────────────────────────
export const customerHandovers = mysqlTable("customer_handovers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  dateKey: varchar("dateKey", { length: 10 }).notNull(),
  customerName: varchar("customerName", { length: 128 }).notNull().default(""),
  store: varchar("store", { length: 64 }).notNull().default(""),
  content: varchar("content", { length: 2048 }).notNull().default(""),
  status: varchar("status", { length: 32 }).notNull().default("対応中"),
  assignee: varchar("assignee", { length: 64 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerHandover = typeof customerHandovers.$inferSelect;
export type InsertCustomerHandover = typeof customerHandovers.$inferInsert;

// ─── MISOCA Status (グローバル) ──────────────────────────────────────────────────────
export const misocaStatus = mysqlTable("misoca_status", {
  id: int("id").autoincrement().primaryKey(),
  completedUntil: varchar("completedUntil", { length: 16 }).notNull().default(""),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MisocaStatus = typeof misocaStatus.$inferSelect;
export type InsertMisocaStatus = typeof misocaStatus.$inferInsert;

// ─── Gray Cell Status (グレーセル確認, グローバル) ─────────────────────────────────────
export const grayCellStatus = mysqlTable("gray_cell_status", {
  id: int("id").autoincrement().primaryKey(),
  confirmedUntil: varchar("confirmedUntil", { length: 16 }).notNull().default(""),
  updatedBy: varchar("updatedBy", { length: 64 }).notNull().default(""),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GrayCellStatus = typeof grayCellStatus.$inferSelect;
export type InsertGrayCellStatus = typeof grayCellStatus.$inferInsert;

// ─── STORES Shift Status (STORESシフト, グローバル) ──────────────────────────────────────
export const storesShiftStatus = mysqlTable("stores_shift_status", {
  id: int("id").autoincrement().primaryKey(),
  confirmedUntil: varchar("confirmedUntil", { length: 16 }).notNull().default(""),
  updatedBy: varchar("updatedBy", { length: 64 }).notNull().default(""),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StoresShiftStatus = typeof storesShiftStatus.$inferSelect;
export type InsertStoresShiftStatus = typeof storesShiftStatus.$inferInsert;
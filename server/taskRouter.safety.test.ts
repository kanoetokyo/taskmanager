import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

const getDbMock = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

import { taskRouter } from "./taskRouter";

function createContext(user = true): TrpcContext {
  return {
    user: user
      ? {
          id: 1,
          openId: "safety-test-user",
          name: "Safety Test",
          email: "safety@example.com",
          loginMethod: "test",
          role: "admin",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("task data safety guards", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("returns an error instead of an empty customer list when the database is unavailable", async () => {
    getDbMock.mockResolvedValue(null);
    const caller = taskRouter.createCaller(createContext());

    await expect(caller.customerHandover.getActive()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("allows legacy unauthenticated task reads while authentication is not configured", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    getDbMock.mockResolvedValue({ select });
    const caller = taskRouter.createCaller(createContext(false));

    await expect(caller.taskStates.getByDate({ dateKey: "2026-07-22" })).resolves.toEqual([]);
  });

  it("customer list reads never invoke a delete operation", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const deleteOperation = vi.fn();
    getDbMock.mockResolvedValue({ select, delete: deleteOperation });
    const caller = taskRouter.createCaller(createContext());

    await expect(caller.customerHandover.getActive()).resolves.toEqual([]);
    expect(deleteOperation).not.toHaveBeenCalled();
  });

  it("rejects a stale task update before it can overwrite a newer revision", async () => {
    const update = vi.fn();
    const limit = vi.fn().mockResolvedValue([
      {
        id: 1,
        dateKey: "2026-07-22",
        taskId: "task-1",
        done: false,
        help: false,
        note: "",
        planned: "担当A",
        revision: 2,
        updatedAt: new Date(),
      },
    ]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ select, update }));
    getDbMock.mockResolvedValue({ transaction });
    const caller = taskRouter.createCaller(createContext());

    await expect(caller.taskStates.upsert({
      dateKey: "2026-07-22",
      taskId: "task-1",
      done: true,
      help: false,
      note: "",
      planned: "担当B",
      expectedRevision: 1,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(update).not.toHaveBeenCalled();
  });
});

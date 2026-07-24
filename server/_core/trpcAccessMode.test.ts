import { afterEach, describe, expect, it } from "vitest";
import { appAdminProcedure, appProcedure, router } from "./trpc";

const accessRouter = router({
  read: appProcedure.query(() => "ok"),
  manage: appAdminProcedure.mutation(() => "ok"),
});

const originalAuthRequired = process.env.AUTH_REQUIRED;

afterEach(() => {
  if (originalAuthRequired === undefined) {
    delete process.env.AUTH_REQUIRED;
  } else {
    process.env.AUTH_REQUIRED = originalAuthRequired;
  }
});

describe("application access mode", () => {
  it("allows application APIs without a session while login is disabled", async () => {
    process.env.AUTH_REQUIRED = "false";
    const caller = accessRouter.createCaller({ user: null } as any);

    await expect(caller.read()).resolves.toBe("ok");
    await expect(caller.manage()).resolves.toBe("ok");
  });

  it("requires a session and administrator role when login is enabled", async () => {
    process.env.AUTH_REQUIRED = "true";
    const anonymousCaller = accessRouter.createCaller({ user: null } as any);

    await expect(anonymousCaller.read()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anonymousCaller.manage()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const adminCaller = accessRouter.createCaller({
      user: { role: "admin" },
    } as any);
    await expect(adminCaller.manage()).resolves.toBe("ok");
  });
});

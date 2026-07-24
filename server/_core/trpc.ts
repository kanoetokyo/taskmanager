import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

function isApplicationLoginRequired() {
  return process.env.AUTH_REQUIRED === "true";
}

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

const requireUserWhenLoginEnabled = t.middleware(async opts => {
  if (!isApplicationLoginRequired()) return opts.next({ ctx: opts.ctx });

  if (!opts.ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return opts.next({
    ctx: {
      ...opts.ctx,
      user: opts.ctx.user,
    },
  });
});

const requireAdminWhenLoginEnabled = t.middleware(async opts => {
  if (!isApplicationLoginRequired()) return opts.next({ ctx: opts.ctx });

  if (!opts.ctx.user || opts.ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }

  return opts.next({
    ctx: {
      ...opts.ctx,
      user: opts.ctx.user,
    },
  });
});

// Application data is public while AUTH_REQUIRED is unset. This keeps the
// shared-device workflow open while allowing authentication to return later.
export const appProcedure = t.procedure.use(requireUserWhenLoginEnabled);
export const appAdminProcedure = t.procedure.use(requireAdminWhenLoginEnabled);

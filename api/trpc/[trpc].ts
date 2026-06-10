import type { IncomingMessage, ServerResponse } from "http";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "../../server/routers";
import { sdk } from "../../server/_core/sdk";
import type { TrpcContext } from "../../server/_core/context";
import type { User } from "../../drizzle/schema";

export const config = {
  api: {
    bodyParser: false,
  },
};

type VercelRequest = IncomingMessage & {
  query?: {
    trpc?: string | string[];
  };
};

type CookieOptions = {
  domain?: string;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

type VercelResponse = ServerResponse & {
  clearCookie?: (name: string, options?: CookieOptions) => void;
};

function appendSetCookie(res: ServerResponse, cookie: string) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }

  const values = Array.isArray(current) ? current : [String(current)];
  res.setHeader("Set-Cookie", [...values, cookie]);
}

function serializeClearedCookie(name: string, options: CookieOptions) {
  const parts = [
    `${encodeURIComponent(name)}=`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];

  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const sameSite = options.sameSite === true ? "Strict" : options.sameSite;
    parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  }

  return parts.join("; ");
}

function withExpressCookieCompat(res: VercelResponse): VercelResponse {
  res.clearCookie = (name, options = {}) => {
    appendSetCookie(
      res,
      serializeClearedCookie(name, {
        domain: options.domain,
        httpOnly: options.httpOnly,
        path: options.path ?? "/",
        sameSite: options.sameSite,
        secure: options.secure,
      })
    );
  };

  return res;
}

function getTrpcPath(req: VercelRequest) {
  const queryPath = req.query?.trpc;
  if (Array.isArray(queryPath)) return queryPath.join("/");
  if (queryPath) return queryPath;

  const pathname = (req.url ?? "").split("?")[0] ?? "";
  return pathname.replace(/^\/api\/trpc\/?/, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const response = withExpressCookieCompat(res);

  await nodeHTTPRequestHandler({
    req,
    res: response,
    path: getTrpcPath(req),
    router: appRouter,
    createContext: async (): Promise<TrpcContext> => {
      let user: User | null = null;

      try {
        user = await sdk.authenticateRequest(req as any);
      } catch {
        user = null;
      }

      return {
        req: req as any,
        res: response as any,
        user,
      };
    },
  });
}

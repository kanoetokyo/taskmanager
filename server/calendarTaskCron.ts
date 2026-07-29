import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  getDefaultSyncMonth,
  isCalendarAutomationEnabled,
  runCalendarTaskSync,
} from "./calendarAutomation";

export const config = {
  maxDuration: 60,
};

const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_ACTIONS_AUDIENCE = "https://github.com/kanoetokyo";
const GITHUB_ACTIONS_REPOSITORY = "kanoetokyo/taskmanager";
const GITHUB_ACTIONS_PREVIEW_WORKFLOW_REF =
  "kanoetokyo/taskmanager/.github/workflows/run-calendar-preview-sync.yml@refs/heads/main";
const GITHUB_ACTIONS_PRODUCTION_WORKFLOW_REF =
  "kanoetokyo/taskmanager/.github/workflows/run-calendar-production-sync.yml@refs/heads/main";
const githubActionsJwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks")
);

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isCronSecretAuthorized(req: IncomingMessage) {
  const secret = process.env.CRON_SECRET;
  const authorization = headerValue(req.headers.authorization);
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function isAllowedGitHubActionsSync(payload: JWTPayload) {
  const allowedWorkflowRef =
    process.env.VERCEL_ENV === "preview"
      ? GITHUB_ACTIONS_PREVIEW_WORKFLOW_REF
      : process.env.VERCEL_ENV === "production"
        ? GITHUB_ACTIONS_PRODUCTION_WORKFLOW_REF
        : null;

  return (
    allowedWorkflowRef !== null &&
    payload.repository === GITHUB_ACTIONS_REPOSITORY &&
    payload.ref === "refs/heads/main" &&
    payload.event_name === "workflow_dispatch" &&
    payload.workflow_ref === allowedWorkflowRef
  );
}

async function isGitHubActionsAuthorized(req: IncomingMessage) {
  const authorization = headerValue(req.headers.authorization);
  if (!authorization?.startsWith("Bearer ")) return false;

  try {
    const { payload } = await jwtVerify(
      authorization.slice("Bearer ".length),
      githubActionsJwks,
      {
        issuer: GITHUB_ACTIONS_ISSUER,
        audience: GITHUB_ACTIONS_AUDIENCE,
      }
    );
    return isAllowedGitHubActionsSync(payload);
  } catch {
    return false;
  }
}

async function isAuthorized(req: IncomingMessage) {
  return isCronSecretAuthorized(req) || (await isGitHubActionsAuthorized(req));
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function requestUrl(req: IncomingMessage) {
  const host = headerValue(req.headers.host) ?? "localhost";
  return new URL(req.url ?? "/", `https://${host}`);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!(await isAuthorized(req))) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  if (!isCalendarAutomationEnabled()) {
    sendJson(res, 503, { error: "Calendar automation is disabled" });
    return;
  }

  const url = requestUrl(req);
  const requestedMonth = url.searchParams.get("month");
  if (requestedMonth && !/^\d{4}-\d{2}$/.test(requestedMonth)) {
    sendJson(res, 400, { error: "Invalid target month" });
    return;
  }

  try {
    const result = await runCalendarTaskSync({
      targetMonth: requestedMonth ?? getDefaultSyncMonth(),
      dryRun: url.searchParams.get("dryRun") === "1",
      requestId: headerValue(req.headers["x-vercel-id"]) ?? "calendar-cron",
    });
    const counts = result.outcomes.reduce<Record<string, number>>(
      (summary, outcome) => {
        summary[outcome.action] = (summary[outcome.action] ?? 0) + 1;
        return summary;
      },
      {}
    );
    sendJson(res, 200, {
      targetMonth: result.targetMonth,
      dryRun: result.dryRun,
      counts,
      ...(result.dryRun ? { diagnostics: result.diagnostics } : {}),
    });
  } catch (error) {
    console.error("[Calendar automation] Synchronization failed", error);
    sendJson(res, 500, { error: "Calendar synchronization failed" });
  }
}

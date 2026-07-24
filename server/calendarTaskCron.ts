import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getDefaultSyncMonth,
  isCalendarAutomationEnabled,
  runCalendarTaskSync,
} from "./calendarAutomation";

export const config = {
  maxDuration: 60,
};

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isAuthorized(req: IncomingMessage) {
  const secret = process.env.CRON_SECRET;
  const authorization = headerValue(req.headers.authorization);
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
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
  if (!isAuthorized(req)) {
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
    });
  } catch (error) {
    console.error("[Calendar automation] Synchronization failed", error);
    sendJson(res, 500, { error: "Calendar synchronization failed" });
  }
}

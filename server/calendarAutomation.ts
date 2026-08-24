import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";
import { auditLogs, calendarAutoTasks } from "../drizzle/schema";
import { getDb } from "./db";

const JAPAN_TIME_ZONE = "Asia/Tokyo";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";
const calendarMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const ruleSchema = z
  .object({
    id: z.string().min(1).max(128),
    calendarId: z.string().min(1).max(512),
    // Older private configurations infer this from their first exact customer identifier.
    customerDisplayName: z.string().min(1).max(128).optional(),
    customerMatch: z.object({
      descriptionMustContain: z
        .array(z.string().min(1).max(512))
        .min(3)
        .max(8),
      summaryMustContain: z.array(z.string().min(1).max(128)).max(3).optional(),
    }),
    officePresence: z.object({
      titleContainsAny: z.array(z.string().min(1).max(128)).min(1).max(8),
      colorId: z.string().min(1).max(16),
      searchBackDays: z.number().int().min(1).max(7).default(7),
      searchForwardDays: z.number().int().min(0).max(7).optional(),
    }),
    task: z.object({
      title: z.string().min(1).max(512),
      category: z.string().min(1).max(128),
      defaultPlanned: z.string().max(64).default("当日事務担当"),
    }),
  })
  .superRefine((rule, context) => {
    const customerName = normalizeForMatch(
      rule.customerDisplayName ?? rule.customerMatch.descriptionMustContain[0]
    );
    const nameIsMatched = rule.customerMatch.descriptionMustContain.some(
      value => normalizeForMatch(value) === customerName
    );
    if (!nameIsMatched) {
      context.addIssue({
        code: "custom",
        path: ["customerMatch", "descriptionMustContain"],
        message: "Customer display name must be included as an exact description match.",
      });
    }

    if (!normalizeForMatch(rule.task.title).includes(customerName)) {
      context.addIssue({
        code: "custom",
        path: ["task", "title"],
        message: "Task title must include the configured customer display name.",
      });
    }
  });

const googleEventSchema = z.object({
  id: z.string().min(1),
  summary: z.string().optional().default(""),
  description: z.string().optional().default(""),
  status: z.string().optional().default("confirmed"),
  colorId: z.string().optional(),
  start: z.object({
    date: z.string().optional(),
    dateTime: z.string().optional(),
  }),
  end: z
    .object({
      date: z.string().optional(),
      dateTime: z.string().optional(),
    })
    .optional(),
});

type RawCalendarTaskRule = z.infer<typeof ruleSchema>;
export type CalendarTaskRule = RawCalendarTaskRule & {
  customerDisplayName: string;
};
export type GoogleCalendarEvent = z.infer<typeof googleEventSchema>;

type TaskDecision = {
  kind: "task" | "no_matching_visit";
  sourceEventId?: string;
  finalVisitDate?: string;
  dateKey?: string;
  label?: string;
  status?: "scheduled" | "needs_review";
  reason?: "no_office_presence";
};

type PersistableTask = {
  sourceEventId: string | null;
  dateKey: string;
  category: string;
  label: string;
  defaultPlanned: string;
  status: "scheduled" | "needs_review";
  details: Record<string, string>;
};

type SyncOutcome = {
  ruleId: string;
  action: "created" | "updated" | "unchanged" | "skipped";
  status?: "scheduled" | "needs_review";
  reason?: "no_matching_visit" | "deactivated";
};

export type CalendarSyncDiagnostic = {
  ruleId: string;
  fetchedEventCount: number;
  targetMonthEventCount: number;
  configuredMatchHashes: string[];
  matchingFieldCounts: number[];
  matchingVisitStartDates: string[];
  candidateEvents: Array<{
    startDate: string | null;
    matchedFields: boolean[];
  }>;
};

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function normalizeForMatch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s\-‐‑‒–—―ー]/g, "");
}

function dateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateKeyInJapan(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return dateKeyFromParts(
    Number(values.year),
    Number(values.month),
    Number(values.day)
  );
}

function dateKeyForNow(now: Date) {
  return dateKeyInJapan(now.toISOString()) ?? "";
}

export function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

export function monthForDateKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

function addMonths(targetMonth: string, amount: number) {
  const [year, month] = targetMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function eventStartDateKey(event: GoogleCalendarEvent) {
  if (event.start.date) return event.start.date;
  return event.start.dateTime ? dateKeyInJapan(event.start.dateTime) : null;
}

function eventEndDateKey(event: GoogleCalendarEvent) {
  if (!event.end) return eventStartDateKey(event);
  if (event.end.date) return shiftDateKey(event.end.date, -1);
  return event.end.dateTime ? dateKeyInJapan(event.end.dateTime) : eventStartDateKey(event);
}

function eventCoversDate(event: GoogleCalendarEvent, dateKey: string) {
  const start = eventStartDateKey(event);
  const end = eventEndDateKey(event);
  return Boolean(start && end && start <= dateKey && dateKey <= end);
}

function eventMatchesCustomer(event: GoogleCalendarEvent, rule: CalendarTaskRule) {
  if (event.status === "cancelled") return false;
  const description = normalizeForMatch(event.description);
  const summary = normalizeForMatch(event.summary);
  return (
    rule.customerMatch.descriptionMustContain.every(value =>
      includesConfiguredCustomerValue(description, normalizeForMatch(value))
    ) &&
    (rule.customerMatch.summaryMustContain ?? []).every(value =>
      includesConfiguredCustomerValue(summary, normalizeForMatch(value))
    )
  );
}

function calendarSyncDiagnostic(
  rule: CalendarTaskRule,
  events: GoogleCalendarEvent[],
  targetMonth: string
): CalendarSyncDiagnostic {
  const activeEvents = events.filter(event => event.status !== "cancelled");
  const matchValues = rule.customerMatch.descriptionMustContain.map(value =>
    normalizeForMatch(value)
  );
  const fieldMatches = (event: GoogleCalendarEvent) => {
    const description = normalizeForMatch(event.description);
    return matchValues.map(value =>
      includesConfiguredCustomerValue(description, value)
    );
  };
  const matchingVisits = activeEvents.filter(
    event =>
      eventStartDateKey(event)?.startsWith(targetMonth) &&
      eventMatchesCustomer(event, rule)
  );

  return {
    ruleId: rule.id,
    fetchedEventCount: events.length,
    targetMonthEventCount: activeEvents.filter(event =>
      eventStartDateKey(event)?.startsWith(targetMonth)
    ).length,
    configuredMatchHashes: matchValues.map(value =>
      createHash("sha256").update(value).digest("hex").slice(0, 12)
    ),
    matchingFieldCounts: matchValues.map(value => {
      return activeEvents.filter(event =>
        includesConfiguredCustomerValue(
          normalizeForMatch(event.description),
          value
        )
      ).length;
    }),
    matchingVisitStartDates: matchingVisits
      .map(event => eventStartDateKey(event))
      .filter((dateKey): dateKey is string => Boolean(dateKey))
      .sort(),
    candidateEvents: activeEvents
      .map(event => ({ startDate: eventStartDateKey(event), matchedFields: fieldMatches(event) }))
      .filter(candidate => candidate.matchedFields.some(Boolean))
      .sort((left, right) => (left.startDate ?? "").localeCompare(right.startDate ?? ""))
      .slice(-10),
  };
}

function includesConfiguredCustomerValue(
  description: string,
  configuredValue: string
) {
  if (!configuredValue) return false;

  let index = description.indexOf(configuredValue);
  while (index !== -1) {
    const followingCharacter = description[index + configuredValue.length] ?? "";
    // Avoid treating a numeric identifier as a prefix of a different value,
    // such as an address ending in 2 matching another address ending in 28.
    if (!/\d$/.test(configuredValue) || !/^\d/.test(followingCharacter)) {
      return true;
    }
    index = description.indexOf(configuredValue, index + configuredValue.length);
  }

  return false;
}

function hasOfficePresence(
  events: GoogleCalendarEvent[],
  rule: CalendarTaskRule,
  dateKey: string
) {
  return events.some(event => {
    if (event.status === "cancelled") {
      return false;
    }
    // Google omits colorId when an event inherits the calendar's default color.
    if (event.colorId && event.colorId !== rule.officePresence.colorId) {
      return false;
    }
    const summary = normalizeForMatch(event.summary);
    return (
      eventCoversDate(event, dateKey) &&
      rule.officePresence.titleContainsAny.some(value =>
        summary.includes(normalizeForMatch(value))
      )
    );
  });
}

function eventSortValue(event: GoogleCalendarEvent) {
  return event.start.dateTime ?? `${event.start.date ?? ""}T00:00:00+09:00`;
}

export function evaluateCalendarTaskRule(
  rule: CalendarTaskRule,
  events: GoogleCalendarEvent[],
  targetMonth: string,
  runDateKey: string
): TaskDecision {
  const visits = events
    .filter(event => eventStartDateKey(event)?.startsWith(targetMonth))
    .filter(event => eventMatchesCustomer(event, rule))
    .sort((left, right) => eventSortValue(left).localeCompare(eventSortValue(right)));

  const finalVisit = visits.at(-1);
  const finalVisitDate = finalVisit ? eventStartDateKey(finalVisit) : null;
  if (!finalVisit || !finalVisitDate) {
    return { kind: "no_matching_visit" };
  }

  const searchForwardDays = rule.officePresence.searchForwardDays;
  const offsets =
    searchForwardDays === undefined
      ? Array.from(
          { length: rule.officePresence.searchBackDays },
          (_, index) => -(index + 1)
        )
      : Array.from({ length: searchForwardDays + 1 }, (_, index) => index);

  for (const offset of offsets) {
    const dateKey = shiftDateKey(finalVisitDate, offset);
    if (hasOfficePresence(events, rule, dateKey)) {
      return {
        kind: "task",
        sourceEventId: finalVisit.id,
        finalVisitDate,
        dateKey,
        label: rule.task.title,
        status: "scheduled",
      };
    }
  }

  return {
    kind: "task",
    sourceEventId: finalVisit.id,
    finalVisitDate,
    dateKey: runDateKey,
    label: `${rule.task.title}（事務在席日要確認）`,
    status: "needs_review",
    reason: "no_office_presence",
  };
}

export function getDefaultSyncMonth(now = new Date()) {
  const currentMonth = monthForDateKey(dateKeyForNow(now));
  const currentDay = Number(dateKeyForNow(now).slice(-2));
  return currentDay === 21 ? addMonths(currentMonth, 1) : currentMonth;
}

export function isCalendarAutomationEnabled() {
  return process.env.CALENDAR_AUTOMATION_ENABLED === "true";
}

export function getCalendarTaskRules() {
  const raw = process.env.CALENDAR_AUTO_TASK_RULES_JSON;
  if (!raw) return [];

  return parseCalendarTaskRules(raw);
}

export function parseCalendarTaskRuleEndMonths(raw?: string) {
  if (!raw) return {} as Record<string, string>;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Calendar automation end-month configuration is invalid.");
  }

  return z.record(z.string(), calendarMonthSchema).parse(parsed);
}

export function isCalendarTaskRuleActive(
  ruleId: string,
  targetMonth: string,
  endMonths = parseCalendarTaskRuleEndMonths(
    process.env.CALENDAR_AUTO_TASK_RULE_END_MONTHS_JSON
  )
) {
  const endMonth = endMonths[ruleId];
  return !endMonth || targetMonth <= endMonth;
}

export function parseCalendarTaskRules(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Calendar automation rule configuration is invalid.");
  }
  return z.array(ruleSchema).min(1).parse(parsed).map(rule => ({
    ...rule,
    customerDisplayName:
      rule.customerDisplayName ?? rule.customerMatch.descriptionMustContain[0],
  }));
}

export function selectCalendarTaskRules(
  rules: CalendarTaskRule[],
  ruleId?: string
) {
  if (!ruleId) return rules;
  return rules.filter(rule => rule.id === ruleId);
}

export function calendarWindow(targetMonth: string) {
  const firstDay = `${targetMonth}-01`;
  const nextMonth = addMonths(targetMonth, 1);
  return {
    timeMin: `${shiftDateKey(firstDay, -7)}T00:00:00+09:00`,
    // Forward-scheduled tasks may need an office day in the following month.
    timeMax: `${shiftDateKey(`${nextMonth}-01`, 7)}T00:00:00+09:00`,
  };
}

async function getGoogleAccessToken() {
  const clientEmail = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error("Google Calendar service account is not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: GOOGLE_CALENDAR_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as
      | { error?: unknown }
      | null;
    const reason =
      failure && typeof failure.error === "string"
        ? failure.error
        : `HTTP ${response.status}`;
    throw new Error(`Google Calendar authorization failed (${reason}).`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Google Calendar token is missing.");
  return payload.access_token;
}

async function readCalendarEvents(calendarId: string, targetMonth: string) {
  const accessToken = await getGoogleAccessToken();
  const { timeMin, timeMax } = calendarWindow(targetMonth);
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeZone", JAPAN_TIME_ZONE);
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set(
      "fields",
      "items(id,summary,description,status,colorId,start,end),nextPageToken"
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error("Google Calendar read failed.");

    const payload = (await response.json()) as {
      items?: unknown[];
      nextPageToken?: string;
    };
    events.push(
      ...(payload.items ?? [])
        .map(item => googleEventSchema.safeParse(item))
        .filter(result => result.success)
        .map(result => result.data)
    );
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return events;
}

function generatedTaskId(ruleId: string, targetMonth: string) {
  const digest = createHash("sha256")
    .update(`${ruleId}:${targetMonth}`)
    .digest("hex")
    .slice(0, 32);
  return `calendar-${digest}`;
}

function taskValues(
  rule: CalendarTaskRule,
  targetMonth: string,
  task: PersistableTask
) {
  return {
    sourceEventId: task.sourceEventId,
    dateKey: task.dateKey,
    category: task.category,
    label: task.label,
    defaultPlanned: task.defaultPlanned,
    status: task.status,
    details: task.details,
    ruleId: rule.id,
    targetMonth,
  };
}

function sameGeneratedTask(
  current: typeof calendarAutoTasks.$inferSelect,
  next: ReturnType<typeof taskValues>
) {
  return (
    current.sourceEventId === next.sourceEventId &&
    current.dateKey === next.dateKey &&
    current.category === next.category &&
    current.label === next.label &&
    current.defaultPlanned === next.defaultPlanned &&
    current.status === next.status &&
    JSON.stringify(current.details) === JSON.stringify(next.details)
  );
}

async function upsertGeneratedTask(
  db: Database,
  rule: CalendarTaskRule,
  targetMonth: string,
  task: PersistableTask,
  requestId: string
) {
  const values = taskValues(rule, targetMonth, task);
  return db.transaction(async tx => {
    const currentRows = await tx
      .select()
      .from(calendarAutoTasks)
      .where(
        and(
          eq(calendarAutoTasks.ruleId, rule.id),
          eq(calendarAutoTasks.targetMonth, targetMonth)
        )
      )
      .limit(1);
    const current = currentRows[0];

    if (current && sameGeneratedTask(current, values)) return "unchanged" as const;

    if (current) {
      const [updated] = await tx
        .update(calendarAutoTasks)
        .set({ ...values, revision: current.revision + 1 })
        .where(
          and(
            eq(calendarAutoTasks.id, current.id),
            eq(calendarAutoTasks.revision, current.revision)
          )
        )
        .returning();
      if (!updated) throw new Error("Calendar task changed during synchronization.");
      await tx.insert(auditLogs).values({
        entityType: "calendar_auto_task",
        entityId: updated.id,
        action: "update",
        before: current,
        after: updated,
        actorId: "calendar-automation",
        requestId,
      });
      return "updated" as const;
    }

    const [created] = await tx
      .insert(calendarAutoTasks)
      .values({
        id: generatedTaskId(rule.id, targetMonth),
        ...values,
        revision: 1,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) return "unchanged" as const;
    await tx.insert(auditLogs).values({
      entityType: "calendar_auto_task",
      entityId: created.id,
      action: "create",
      before: null,
      after: created,
      actorId: "calendar-automation",
      requestId,
    });
    return "created" as const;
  });
}

function toPersistableTask(
  rule: CalendarTaskRule,
  decision: Exclude<TaskDecision, { kind: "no_matching_visit" }>
): PersistableTask {
  return {
    sourceEventId: decision.sourceEventId ?? null,
    dateKey: decision.dateKey ?? "",
    category: rule.task.category,
    label: decision.label ?? rule.task.title,
    defaultPlanned: rule.task.defaultPlanned,
    status: decision.status ?? "scheduled",
    details: {
      customerDisplayName: rule.customerDisplayName,
      finalVisitDate: decision.finalVisitDate ?? "",
      reason: decision.reason ?? "",
    },
  };
}

function missingVisitReview(rule: CalendarTaskRule, runDateKey: string): PersistableTask {
  return {
    sourceEventId: null,
    dateKey: runDateKey,
    category: rule.task.category,
    label: `${rule.task.title}（訪問予定要確認）`,
    defaultPlanned: rule.task.defaultPlanned,
    status: "needs_review",
    details: { reason: "no_matching_visit" },
  };
}

async function findGeneratedTask(db: Database, ruleId: string, targetMonth: string) {
  const rows = await db
    .select()
    .from(calendarAutoTasks)
    .where(
      and(
        eq(calendarAutoTasks.ruleId, ruleId),
        eq(calendarAutoTasks.targetMonth, targetMonth)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function runCalendarTaskSync(options: {
  targetMonth: string;
  dryRun?: boolean;
  now?: Date;
  requestId?: string;
  ruleId?: string;
}) {
  if (!isCalendarAutomationEnabled()) {
    throw new Error("Calendar automation is disabled.");
  }

  const selectedRules = selectCalendarTaskRules(getCalendarTaskRules(), options.ruleId);
  if (selectedRules.length === 0) {
    throw new Error("The requested calendar automation rule was not found.");
  }
  const rules = selectedRules.filter(rule =>
    isCalendarTaskRuleActive(rule.id, options.targetMonth)
  );
  if (rules.length === 0) {
    return {
      targetMonth: options.targetMonth,
      dryRun: Boolean(options.dryRun),
      outcomes: selectedRules.map(rule => ({
        ruleId: rule.id,
        action: "skipped" as const,
        reason: "deactivated" as const,
      })),
      diagnostics: [],
    };
  }
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable for calendar automation.");

  const runDateKey = dateKeyForNow(options.now ?? new Date());
  const eventsByCalendar = new Map<string, GoogleCalendarEvent[]>();
  const outcomes: SyncOutcome[] = [];
  const diagnostics: CalendarSyncDiagnostic[] = [];

  for (const rule of rules) {
    let events = eventsByCalendar.get(rule.calendarId);
    if (!events) {
      events = await readCalendarEvents(rule.calendarId, options.targetMonth);
      eventsByCalendar.set(rule.calendarId, events);
    }

    diagnostics.push(calendarSyncDiagnostic(rule, events, options.targetMonth));

    const decision = evaluateCalendarTaskRule(
      rule,
      events,
      options.targetMonth,
      runDateKey
    );
    const existing = await findGeneratedTask(db, rule.id, options.targetMonth);

    if (decision.kind === "no_matching_visit") {
      if (!existing) {
        outcomes.push({
          ruleId: rule.id,
          action: "skipped",
          reason: "no_matching_visit",
        });
        continue;
      }

      const reviewTask = missingVisitReview(rule, runDateKey);
      if (options.dryRun) {
        outcomes.push({
          ruleId: rule.id,
          action: sameGeneratedTask(existing, taskValues(rule, options.targetMonth, reviewTask))
            ? "unchanged"
            : "updated",
          status: "needs_review",
        });
      } else {
        outcomes.push({
          ruleId: rule.id,
          action: await upsertGeneratedTask(
            db,
            rule,
            options.targetMonth,
            reviewTask,
            options.requestId ?? "calendar-cron"
          ),
          status: "needs_review",
        });
      }
      continue;
    }

    const task = toPersistableTask(rule, decision);
    if (options.dryRun) {
      outcomes.push({
        ruleId: rule.id,
        action: existing
          ? sameGeneratedTask(existing, taskValues(rule, options.targetMonth, task))
            ? "unchanged"
            : "updated"
          : "created",
        status: task.status,
      });
      continue;
    }

    outcomes.push({
      ruleId: rule.id,
      action: await upsertGeneratedTask(
        db,
        rule,
        options.targetMonth,
        task,
        options.requestId ?? "calendar-cron"
      ),
      status: task.status,
    });
  }

  return {
    targetMonth: options.targetMonth,
    dryRun: Boolean(options.dryRun),
    outcomes,
    diagnostics,
  };
}

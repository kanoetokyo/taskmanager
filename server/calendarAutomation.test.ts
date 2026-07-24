import { describe, expect, it } from "vitest";
import {
  evaluateCalendarTaskRule,
  type CalendarTaskRule,
  type GoogleCalendarEvent,
} from "./calendarAutomation";

const rule: CalendarTaskRule = {
  id: "customer-a-invoice",
  calendarId: "calendar@example.com",
  customerMatch: {
    descriptionMustContain: ["Customer A", "090-1111-2222", "Example address"],
  },
  officePresence: {
    titleContainsAny: ["NAO", "Office Admin"],
    colorId: "3",
    searchBackDays: 7,
  },
  task: {
    title: "Customer A invoice printing",
    category: "調整および書類作成",
    defaultPlanned: "当日事務担当",
  },
};

function event(
  id: string,
  date: string,
  overrides: Partial<GoogleCalendarEvent> = {}
): GoogleCalendarEvent {
  return {
    id,
    summary: "Visit",
    description: "",
    status: "confirmed",
    start: { date },
    end: { date: "2026-08-01" },
    ...overrides,
  };
}

const matchingDescription = "Customer A\n09011112222\nExample address";

describe("calendar task evaluation", () => {
  it("requires every configured description field and ignores a title-only match", () => {
    const decision = evaluateCalendarTaskRule(
      rule,
      [
        event("title-only", "2026-08-25", {
          summary: "Customer A",
          description: "Customer A only",
        }),
      ],
      "2026-08",
      "2026-07-21"
    );

    expect(decision).toEqual({ kind: "no_matching_visit" });
  });

  it("uses the final matching visit and the nearest prior office-presence day", () => {
    const decision = evaluateCalendarTaskRule(
      rule,
      [
        event("first-visit", "2026-08-05", { description: matchingDescription }),
        event("final-visit", "2026-08-25", { description: matchingDescription }),
        event("office", "2026-08-24", {
          summary: "NAO",
          colorId: "3",
          start: { date: "2026-08-24" },
          end: { date: "2026-08-25" },
        }),
      ],
      "2026-08",
      "2026-07-21"
    );

    expect(decision).toMatchObject({
      kind: "task",
      sourceEventId: "final-visit",
      finalVisitDate: "2026-08-25",
      dateKey: "2026-08-24",
      status: "scheduled",
    });
  });

  it("accepts an all-day office event spanning the day before the final visit", () => {
    const decision = evaluateCalendarTaskRule(
      rule,
      [
        event("final-visit", "2026-08-25", { description: matchingDescription }),
        event("office-span", "2026-08-23", {
          summary: "Office Admin",
          colorId: "3",
          start: { date: "2026-08-23" },
          // Google Calendar all-day event end dates are exclusive.
          end: { date: "2026-08-25" },
        }),
      ],
      "2026-08",
      "2026-07-21"
    );

    expect(decision).toMatchObject({ kind: "task", dateKey: "2026-08-24" });
  });

  it("does not treat the right title in the wrong calendar color as office presence", () => {
    const decision = evaluateCalendarTaskRule(
      rule,
      [
        event("final-visit", "2026-08-25", { description: matchingDescription }),
        event("wrong-color-office", "2026-08-24", {
          summary: "NAO",
          colorId: "8",
          start: { date: "2026-08-24" },
          end: { date: "2026-08-25" },
        }),
      ],
      "2026-08",
      "2026-07-21"
    );

    expect(decision).toMatchObject({
      kind: "task",
      dateKey: "2026-07-21",
      status: "needs_review",
      reason: "no_office_presence",
    });
  });

  it("creates a review decision on the run date when no office day exists within seven days", () => {
    const decision = evaluateCalendarTaskRule(
      rule,
      [event("final-visit", "2026-08-25", { description: matchingDescription })],
      "2026-08",
      "2026-08-01"
    );

    expect(decision).toMatchObject({
      kind: "task",
      dateKey: "2026-08-01",
      status: "needs_review",
      reason: "no_office_presence",
    });
  });
});

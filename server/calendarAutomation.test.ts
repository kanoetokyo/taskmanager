import { describe, expect, it } from "vitest";
import {
  calendarWindow,
  evaluateCalendarTaskRule,
  selectCalendarTaskRules,
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
  it("reads seven days past month end for forward-scheduled tasks", () => {
    expect(calendarWindow("2026-07")).toEqual({
      timeMin: "2026-06-24T00:00:00+09:00",
      timeMax: "2026-08-08T00:00:00+09:00",
    });
  });

  it("limits a sync to the explicitly requested rule", () => {
    expect(
      selectCalendarTaskRules(
        [rule, { ...rule, id: "customer-b-invoice" }],
        "customer-b-invoice"
      )
    ).toEqual([{ ...rule, id: "customer-b-invoice" }]);
    expect(selectCalendarTaskRules([rule], "missing-rule")).toEqual([]);
  });

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

  it("does not match a numeric customer identifier as a prefix", () => {
    const numericRule: CalendarTaskRule = {
      ...rule,
      customerMatch: {
        descriptionMustContain: ["Customer A", "09011112222", "Road 2"],
      },
    };
    const decision = evaluateCalendarTaskRule(
      numericRule,
      [
        event("different-address", "2026-08-25", {
          description: "Customer A\n09011112222\nRoad 28",
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

  it("requires the configured store name in the event title when provided", () => {
    const storeRule: CalendarTaskRule = {
      ...rule,
      customerMatch: {
        ...rule.customerMatch,
        summaryMustContain: ["Oimachi"],
      },
    };
    const decision = evaluateCalendarTaskRule(
      storeRule,
      [
        event("wrong-store", "2026-08-25", {
          summary: "Customer A (Other store)",
          description: matchingDescription,
        }),
      ],
      "2026-08",
      "2026-07-21"
    );

    expect(decision).toEqual({ kind: "no_matching_visit" });
  });

  it("can schedule on the final visit date or a later office-presence day", () => {
    const forwardRule: CalendarTaskRule = {
      ...rule,
      officePresence: {
        ...rule.officePresence,
        searchForwardDays: 7,
      },
    };
    const decision = evaluateCalendarTaskRule(
      forwardRule,
      [
        event("final-visit", "2026-08-25", { description: matchingDescription }),
        event("office-after-visit", "2026-08-27", {
          summary: "NAO",
          colorId: "3",
          start: { date: "2026-08-27" },
          end: { date: "2026-08-28" },
        }),
      ],
      "2026-08",
      "2026-08-01"
    );

    expect(decision).toMatchObject({
      kind: "task",
      finalVisitDate: "2026-08-25",
      dateKey: "2026-08-27",
      status: "scheduled",
    });
  });

  it("matches a customer record in a timed calendar event description", () => {
    const decision = evaluateCalendarTaskRule(
      {
        ...rule,
        customerMatch: {
          descriptionMustContain: [
            "水田",
            "090-2227-1066",
            "世田谷区駒沢4-12-2",
          ],
        },
      },
      [
        event("mizuta-final-visit", "2026-07-31", {
          summary: "【北山】水田様 (大井町店) 09:00 ¥8,700",
          description:
            "【顧客情報】\n氏名: 水田\n電話: 090-2227-1066\n住所: 世田谷区駒沢4-12-2",
          start: { dateTime: "2026-07-31T09:00:00+09:00" },
          end: { dateTime: "2026-07-31T11:00:00+09:00" },
        }),
      ],
      "2026-07",
      "2026-07-29"
    );

    expect(decision).toMatchObject({
      kind: "task",
      sourceEventId: "mizuta-final-visit",
      finalVisitDate: "2026-07-31",
      status: "needs_review",
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

  it("accepts an office event that inherits the calendar default color", () => {
    const decision = evaluateCalendarTaskRule(
      rule,
      [
        event("final-visit", "2026-08-25", { description: matchingDescription }),
        event("default-color-office", "2026-08-24", {
          summary: "NAO",
          start: { date: "2026-08-24" },
          end: { date: "2026-08-25" },
        }),
      ],
      "2026-08",
      "2026-07-21"
    );

    expect(decision).toMatchObject({
      kind: "task",
      dateKey: "2026-08-24",
      status: "scheduled",
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

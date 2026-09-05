import { describe, expect, it } from "vitest";
import {
  filterCustomerHandovers,
  getSharedCustomerStatusFilter,
  sortArchivedCustomerHandovers,
} from "../client/src/pages/customerHandoverFilters";

const customers = [
  {
    status: "不通・未対応" as const,
    name: "佐藤様",
    memo: "SMSで再連絡",
    contact: "SMS",
    assignee: "中尾",
    links: [],
  },
  {
    status: "キャンセル" as const,
    name: "田中様",
    memo: "都合によりキャンセル",
    contact: "電話",
    assignee: "新井なお",
    links: ["https://example.com/tanaka"],
  },
  {
    status: "完了" as const,
    name: "鈴木様",
    memo: "作業完了",
    contact: "電話",
    assignee: "中尾",
    links: [],
  },
];

describe("filterCustomerHandovers", () => {
  it("通常の一覧からキャンセル済みを除外する", () => {
    expect(filterCustomerHandovers(customers, "", "all")).toEqual([customers[0]]);
  });

  it("キャンセルを選んだ時だけキャンセル済みを検索できる", () => {
    expect(filterCustomerHandovers(customers, "田中", "キャンセル")).toEqual([
      customers[1],
    ]);
    expect(filterCustomerHandovers(customers, "SMS", "キャンセル")).toEqual([]);
  });

  it("メモ、担当者、URLも検索対象にする", () => {
    expect(filterCustomerHandovers(customers, "新井", "キャンセル")).toEqual([
      customers[1],
    ]);
    expect(
      filterCustomerHandovers(customers, "example.com", "キャンセル")
    ).toEqual([customers[1]]);
  });

  it("完了を選んだ時だけ完了済みを検索できる", () => {
    expect(filterCustomerHandovers(customers, "鈴木", "完了")).toEqual([
      customers[2],
    ]);
    expect(filterCustomerHandovers(customers, "鈴木", "all")).toEqual([]);
  });

  it("共有リンクでは完了またはキャンセルを表示する絞り込みを選ぶ", () => {
    expect(getSharedCustomerStatusFilter("完了")).toBe("完了");
    expect(getSharedCustomerStatusFilter("キャンセル")).toBe("キャンセル");
    expect(getSharedCustomerStatusFilter("保留")).toBe("all");
  });

  it("完了・キャンセルの日時で新旧順に並び替える", () => {
    const archivedCustomers = [
      {
        id: "older",
        completedAt: "2026-09-01T09:00:00+09:00",
        cancelledAt: "2026-09-02T09:00:00+09:00",
        updatedAt: "2026-09-02T09:00:00+09:00",
      },
      {
        id: "newer",
        completedAt: "2026-09-03T09:00:00+09:00",
        cancelledAt: "2026-09-04T09:00:00+09:00",
        updatedAt: "2026-09-04T09:00:00+09:00",
      },
    ];

    expect(
      sortArchivedCustomerHandovers(archivedCustomers, "完了", "newest").map(
        customer => customer.id
      )
    ).toEqual(["newer", "older"]);
    expect(
      sortArchivedCustomerHandovers(archivedCustomers, "キャンセル", "oldest").map(
        customer => customer.id
      )
    ).toEqual(["older", "newer"]);
  });
});

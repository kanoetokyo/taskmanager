export const CUSTOMER_HANDOVER_STATUSES = [
  "これから",
  "不通・未対応",
  "調整中・仮予約中",
  "保留",
  "キャンセル",
  "完了",
] as const;

export type CustomerHandoverStatus =
  (typeof CUSTOMER_HANDOVER_STATUSES)[number];
export type CustomerHandoverStatusFilter = "all" | CustomerHandoverStatus;

export interface FilterableCustomerHandover {
  status: CustomerHandoverStatus;
  name: string;
  memo: string;
  contact: string;
  assignee: string;
  links: string[];
}

function matchesSearch(record: FilterableCustomerHandover, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  if (!normalizedQuery) return true;

  return [
    record.name,
    record.memo,
    record.contact,
    record.assignee,
    ...record.links,
  ].some(value => value.toLocaleLowerCase("ja-JP").includes(normalizedQuery));
}

export function filterCustomerHandovers<T extends FilterableCustomerHandover>(
  customers: T[],
  query: string,
  statusFilter: CustomerHandoverStatusFilter
): T[] {
  return customers.filter(customer => {
    if (statusFilter === "キャンセル") {
      return customer.status === "キャンセル" && matchesSearch(customer, query);
    }

    if (customer.status === "キャンセル") return false;
    if (statusFilter !== "all" && customer.status !== statusFilter)
      return false;
    return matchesSearch(customer, query);
  });
}

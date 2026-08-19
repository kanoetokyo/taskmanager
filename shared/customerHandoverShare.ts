export function buildCustomerHandoverShare(
  customerId: string,
  customerName: string,
  photoCount: number,
  origin: string
) {
  const url = new URL("/customers", origin);
  url.searchParams.set("customer", customerId);

  const title = customerName.trim()
    ? `${customerName.trim()}の案件`
    : "新規案件";
  const text =
    photoCount > 0 ? `${title}（写真${photoCount}枚）` : title;

  return { title, text, url: url.toString() };
}

import { describe, expect, it } from "vitest";
import { buildCustomerHandoverShare } from "../shared/customerHandoverShare";

describe("customer handover share text", () => {
  it("includes the customer name and URL for cards without photos", () => {
    expect(
      buildCustomerHandoverShare("customer-1", "北村様", 0, "https://example.com")
    ).toEqual({
      title: "北村様の案件",
      text: "北村様の案件",
      url: "https://example.com/customers?customer=customer-1",
    });
  });

  it("keeps the photo count in shares for cards with photos", () => {
    expect(
      buildCustomerHandoverShare("customer-2", "佐藤様", 3, "https://example.com")
    ).toMatchObject({
      title: "佐藤様の案件",
      text: "佐藤様の案件（写真3枚）",
    });
  });
});

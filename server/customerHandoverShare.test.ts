import { describe, expect, it } from "vitest";
import {
  buildCustomerHandoverShare,
  buildLineShareUrl,
} from "../shared/customerHandoverShare";

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

  it("creates an official LINE web share URL with the card link and text", () => {
    const lineShareUrl = new URL(
      buildLineShareUrl(
        "https://example.com/customers?customer=customer-2",
        "佐藤様の案件（写真3枚）"
      )
    );

    expect(lineShareUrl.origin).toBe("https://social-plugins.line.me");
    expect(lineShareUrl.pathname).toBe("/lineit/share");
    expect(lineShareUrl.searchParams.get("url")).toBe(
      "https://example.com/customers?customer=customer-2"
    );
    expect(lineShareUrl.searchParams.get("text")).toBe("佐藤様の案件（写真3枚）");
  });
});

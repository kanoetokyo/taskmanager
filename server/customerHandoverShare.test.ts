import { describe, expect, it } from "vitest";
import {
  buildCustomerHandoverCopyText,
  buildCustomerHandoverShare,
  isMobileLineShareDevice,
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

  it("builds text ready to paste into LINE", () => {
    expect(
      buildCustomerHandoverCopyText(
        "佐藤様の案件（写真3枚）",
        "https://example.com/customers?customer=customer-2"
      )
    ).toBe(
      "佐藤様の案件（写真3枚）\nhttps://example.com/customers?customer=customer-2"
    );
  });

  it("uses the native share action only on mobile devices", () => {
    expect(isMobileLineShareDevice("Mozilla/5.0 (Linux; Android 15)", 0)).toBe(
      true
    );
    expect(isMobileLineShareDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", 0)).toBe(
      true
    );
    expect(isMobileLineShareDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe(
      false
    );
  });
});

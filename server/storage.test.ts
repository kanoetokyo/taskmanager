import { afterEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

vi.mock("@vercel/blob", () => blobMocks);

import { storageDelete, storageGet, storagePut } from "./storage";

describe("customer attachment storage", () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    vi.clearAllMocks();
  });

  it("uses a private Vercel Blob store when production credentials exist", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    blobMocks.put.mockResolvedValue({
      pathname: "customer-handovers/test.jpg",
    });
    blobMocks.issueSignedToken.mockResolvedValue({
      delegationToken: "delegation",
      clientSigningToken: "signing",
      validUntil: Date.now() + 60_000,
    });
    blobMocks.presignUrl.mockResolvedValue({
      presignedUrl: "https://private.example.test/signed",
    });

    const stored = await storagePut(
      "customer-handovers/test.jpg",
      Buffer.from("photo"),
      "image/jpeg"
    );
    const fetched = await storageGet("customer-handovers/test.jpg");
    await storageDelete("customer-handovers/test.jpg");

    expect(blobMocks.put).toHaveBeenCalledWith(
      "customer-handovers/test.jpg",
      expect.any(Buffer),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        contentType: "image/jpeg",
      })
    );
    expect(blobMocks.issueSignedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "customer-handovers/test.jpg",
        operations: ["get"],
      })
    );
    expect(blobMocks.presignUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        access: "private",
        operation: "get",
        pathname: "customer-handovers/test.jpg",
      })
    );
    expect(stored.url).toBe("https://private.example.test/signed");
    expect(fetched.url).toBe("https://private.example.test/signed");
    expect(blobMocks.del).toHaveBeenCalledWith("customer-handovers/test.jpg");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn(() => ({ auth: { getUser } })));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import {
  authenticateSupabaseRequest,
  isSupabaseAuthConfigured,
} from "./supabaseAuth";

const originalEnv = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
};

function configureAuth() {
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.ADMIN_EMAILS = "admin@example.com";
}

afterEach(() => {
  getUser.mockReset();
  createClient.mockClear();
  process.env.VITE_SUPABASE_URL = originalEnv.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
    originalEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.ADMIN_EMAILS = originalEnv.ADMIN_EMAILS;
});

describe("Supabase admin authentication", () => {
  it("requires complete Supabase and administrator configuration", () => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.ADMIN_EMAILS;

    expect(isSupabaseAuthConfigured()).toBe(false);
  });

  it("accepts a valid session for an allowlisted administrator", async () => {
    configureAuth();
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "12345678-1234-1234-1234-123456789012",
          email: "ADMIN@example.com",
          created_at: "2026-07-23T00:00:00.000Z",
          updated_at: "2026-07-23T00:00:00.000Z",
          user_metadata: { full_name: "Admin User" },
        },
      },
      error: null,
    });

    const user = await authenticateSupabaseRequest({
      headers: { authorization: "Bearer valid-token" },
    });

    expect(getUser).toHaveBeenCalledWith("valid-token");
    expect(user).toMatchObject({
      openId: "supabase:12345678-1234-1234-1234-123456789012",
      email: "admin@example.com",
      role: "admin",
    });
  });

  it("rejects a valid session whose email is not allowlisted", async () => {
    configureAuth();
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "12345678-1234-1234-1234-123456789012",
          email: "other@example.com",
          created_at: "2026-07-23T00:00:00.000Z",
          updated_at: "2026-07-23T00:00:00.000Z",
          user_metadata: {},
        },
      },
      error: null,
    });

    await expect(
      authenticateSupabaseRequest({
        headers: { authorization: "Bearer valid-token" },
      })
    ).resolves.toBeNull();
  });
});

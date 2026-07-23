import { createClient } from "@supabase/supabase-js";
import type { User } from "../../drizzle/schema";

type RequestWithHeaders = {
  headers?: Record<string, string | string[] | undefined>;
};

function getHeaderValue(headers: RequestWithHeaders["headers"], name: string) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function getAccessToken(req: RequestWithHeaders) {
  const authorization = getHeaderValue(req.headers, "authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getSupabaseAuthConfig() {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "";
  return { url, publishableKey };
}

export function isSupabaseAuthConfigured() {
  const { url, publishableKey } = getSupabaseAuthConfig();
  return Boolean(url && publishableKey && getAdminEmails().size > 0);
}

export async function authenticateSupabaseRequest(
  req: RequestWithHeaders
): Promise<User | null> {
  const token = getAccessToken(req);
  const { url, publishableKey } = getSupabaseAuthConfig();

  if (!token || !url || !publishableKey) return null;

  const supabase = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.trim().toLowerCase();

  if (error || !data.user || !email || !getAdminEmails().has(email))
    return null;

  const createdAt = data.user.created_at
    ? new Date(data.user.created_at)
    : new Date();
  const updatedAt = data.user.updated_at
    ? new Date(data.user.updated_at)
    : createdAt;
  const displayName =
    typeof data.user.user_metadata.full_name === "string"
      ? data.user.user_metadata.full_name
      : email;

  return {
    id: 0,
    openId: `supabase:${data.user.id}`,
    name: displayName,
    email,
    loginMethod: "supabase",
    role: "admin",
    createdAt,
    updatedAt,
    lastSignedIn: new Date(),
  };
}

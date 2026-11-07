import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/config/env";
import { getServerEnv } from "@/config/server-env";

/**
 * Privileged client using the Supabase SECRET key. It BYPASSES Row Level
 * Security, so it must only be used for trusted server-side jobs (billing
 * webhooks, system notifications) and never with user-controlled filters
 * that have not been authorized first. Never import from client code.
 */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = getServerEnv();
  if (!SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

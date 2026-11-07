import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Returns the signed-in user, verified with supabase.auth.getClaims() — the
 * JWT signature is validated against the project's signing keys, so the value
 * cannot be spoofed by editing cookies. Memoized per request.
 *
 * Authorization NEVER reads user_metadata (it is user-editable); roles come
 * from organization_members in the database.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});

export async function requireUser(nextPath?: string): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

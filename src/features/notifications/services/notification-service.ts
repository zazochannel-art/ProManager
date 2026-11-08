import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type NotificationItem = Pick<Tables<"notifications">, "id" | "type" | "title" | "body" | "link_path" | "read_at" | "created_at">;

/** Notifications for the current user in the active organization (RLS restricts to the recipient). */
export async function listNotifications(
  supabase: ServerSupabaseClient,
  organizationId: string,
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationItem[]> {
  let query = supabase
    .from("notifications")
    .select("id, type, title, body, link_path, read_at, created_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 20);
  if (options.unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load notifications: ${error.message}`);
  return data ?? [];
}

export async function countUnreadNotifications(supabase: ServerSupabaseClient, organizationId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw new Error(`Failed to count notifications: ${error.message}`);
  return count ?? 0;
}

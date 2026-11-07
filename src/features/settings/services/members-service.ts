import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/permissions";

export interface MemberRow {
  id: string;
  userId: string;
  role: Role;
  status: string;
  joinedAt: string;
  name: string;
  email: string;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export async function listMembers(supabase: ServerSupabaseClient, organizationId: string): Promise<MemberRow[]> {
  const { data: members, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role, status, joined_at")
    .eq("organization_id", organizationId)
    .neq("status", "invited")
    .order("joined_at", { ascending: true });
  if (error) throw new Error(`Failed to list members: ${error.message}`);
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", userIds)
    : { data: [], error: null };
  if (profileError) throw new Error(`Failed to load member profiles: ${profileError.message}`);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return (members ?? []).flatMap((m) => {
    if (!isRole(m.role)) return [];
    const profile = byId.get(m.user_id);
    return [{ id: m.id, userId: m.user_id, role: m.role, status: m.status, joinedAt: m.joined_at, name: profile?.full_name ?? "", email: profile?.email ?? "" }];
  });
}

export async function listPendingInvitations(supabase: ServerSupabaseClient, organizationId: string): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, expires_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list invitations: ${error.message}`);
  return (data ?? []).flatMap((i) => (isRole(i.role) ? [{ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at }] : []));
}

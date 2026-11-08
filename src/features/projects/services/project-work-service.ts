import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type ProjectPhase = Pick<Tables<"project_tasks">, "id" | "name" | "planned_start" | "planned_end" | "planned_hours" | "progress_percent" | "sort_order">;

/** Top-level phases (work breakdown) of a project, in planned order. */
export async function listProjectPhases(supabase: ServerSupabaseClient, organizationId: string, projectId: string): Promise<ProjectPhase[]> {
  const { data, error } = await supabase
    .from("project_tasks")
    .select("id, name, planned_start, planned_end, planned_hours, progress_percent, sort_order")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .is("parent_id", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`Failed to list project phases: ${error.message}`);
  return data ?? [];
}

export type ProjectMember = Pick<Tables<"project_members">, "id" | "user_id" | "project_role">;

export async function listProjectMembers(supabase: ServerSupabaseClient, organizationId: string, projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("id, user_id, project_role")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list project members: ${error.message}`);
  return data ?? [];
}

export type ProjectTimeEntry = Pick<Tables<"time_entries">, "id" | "user_id" | "started_at" | "duration_minutes" | "billable" | "notes">;

/**
 * Time logged on a project, newest first. RLS decides what is visible:
 * time.read sees everyone's entries, other members only their own.
 */
export async function listProjectTimeEntries(
  supabase: ServerSupabaseClient,
  organizationId: string,
  projectId: string,
  limit = 50,
): Promise<{ rows: ProjectTimeEntry[]; totalMinutes: number; billableMinutes: number }> {
  const [list, totals] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id, user_id, started_at, duration_minutes, billable, notes")
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("time_entries").select("duration_minutes, billable").eq("organization_id", organizationId).eq("project_id", projectId).limit(10_000),
  ]);
  if (list.error) throw new Error(`Failed to list time entries: ${list.error.message}`);
  if (totals.error) throw new Error(`Failed to total time entries: ${totals.error.message}`);
  let totalMinutes = 0;
  let billableMinutes = 0;
  for (const t of totals.data ?? []) {
    totalMinutes += t.duration_minutes ?? 0;
    if (t.billable) billableMinutes += t.duration_minutes ?? 0;
  }
  return { rows: list.data ?? [], totalMinutes, billableMinutes };
}

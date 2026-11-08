"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext, type OrganizationContext } from "@/lib/auth/organization-context";
import { PermissionError, type Permission } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { uuidField } from "@/lib/validation/common";
import {
  hoursToMinutes,
  phaseCreateSchema,
  phaseProgressSchema,
  projectMemberAddSchema,
  projectMemberRoleSchema,
  timeEntryCreateSchema,
} from "../schemas/project-work";

/**
 * Runs an action for one project: checks the permission, validates the ids and
 * revalidates the project page. RLS and composite foreign keys remain the
 * authority (rows of another organization are rejected by the database).
 */
async function forProject<T>(
  permission: Permission,
  projectId: unknown,
  ids: unknown[],
  run: (ctx: OrganizationContext, projectId: string, ids: string[]) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getActionContext(permission);
    if (!ctx) return fail("unauthenticated");
    const project = uuidField.safeParse(projectId);
    if (!project.success) return fail("not_found");
    const parsedIds: string[] = [];
    for (const id of ids) {
      const parsed = uuidField.safeParse(id);
      if (!parsed.success) return fail("not_found");
      parsedIds.push(parsed.data);
    }
    const result = await run(ctx, project.data, parsedIds);
    if (result.ok) revalidatePath(`/dashboard/projects/${project.data}`);
    return result;
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

// --- Phases -------------------------------------------------------------------

export async function createPhaseAction(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.write", projectId, [], async (ctx, id) => {
    const parsed = phaseCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const last = await supabase
      .from("project_tasks")
      .select("sort_order")
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) return fail(mapDatabaseError(last.error));
    const { data, error } = await supabase
      .from("project_tasks")
      .insert({
        organization_id: ctx.organization.id,
        project_id: id,
        name: v.name,
        planned_start: v.plannedStart ?? null,
        planned_end: v.plannedEnd ?? null,
        // NUMERIC column: the exact decimal string is sent as-is.
        planned_hours: v.plannedHours ?? null,
        sort_order: (last.data?.sort_order ?? -1) + 1,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    return ok({ id: data.id });
  });
}

export async function setPhaseProgressAction(projectId: string, phaseId: string, progress: unknown): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.write", projectId, [phaseId], async (ctx, id, [phase]) => {
    const parsed = phaseProgressSchema.safeParse(progress);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_tasks")
      .update({ progress_percent: parsed.data })
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .eq("id", phase!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    return ok({ id: data.id });
  });
}

export async function deletePhaseAction(projectId: string, phaseId: string): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.write", projectId, [phaseId], async (ctx, id, [phase]) => {
    const supabase = await createClient();
    // Tasks linked to the phase keep existing (FK: on delete set null).
    const { data, error } = await supabase
      .from("project_tasks")
      .delete()
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .eq("id", phase!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    return ok({ id: data.id });
  });
}

// --- Members ------------------------------------------------------------------

export async function addProjectMemberAction(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.write", projectId, [], async (ctx, id) => {
    const parsed = projectMemberAddSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    // FK (organization_id, user_id) → organization_members rejects outsiders.
    const { data, error } = await supabase
      .from("project_members")
      .insert({ organization_id: ctx.organization.id, project_id: id, user_id: parsed.data.userId, project_role: parsed.data.role })
      .select("id")
      .single();
    if (error) {
      const code = mapDatabaseError(error);
      if (code === "conflict") return fail("conflict", { fieldErrors: { userId: "alreadyMember" } });
      return fail(code);
    }
    return ok({ id: data.id });
  });
}

export async function setProjectMemberRoleAction(projectId: string, memberId: string, role: unknown): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.write", projectId, [memberId], async (ctx, id, [member]) => {
    const parsed = projectMemberRoleSchema.safeParse(role);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_members")
      .update({ project_role: parsed.data })
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .eq("id", member!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    return ok({ id: data.id });
  });
}

export async function removeProjectMemberAction(projectId: string, memberId: string): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.write", projectId, [memberId], async (ctx, id, [member]) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_members")
      .delete()
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .eq("id", member!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    return ok({ id: data.id });
  });
}

// --- Time ---------------------------------------------------------------------

/**
 * Logs hours on a project. Members with time.write_own log their own time;
 * time.manage may log for any member. The hourly cost is filled in by the
 * database from the employee record (apply_time_entry_rules).
 */
export async function logTimeAction(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.read", projectId, [], async (ctx, id) => {
    const parsed = timeEntryCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const userId = v.userId ?? ctx.user.id;
    const allowed = ctx.can("time.manage") || (userId === ctx.user.id && ctx.can("time.write_own"));
    if (!allowed) return fail("forbidden");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("time_entries")
      .insert({
        organization_id: ctx.organization.id,
        project_id: id,
        user_id: userId,
        // Date-only entries are stored at 12:00 UTC so the work day never shifts in MD/RO/EU time zones.
        started_at: `${v.date}T12:00:00Z`,
        duration_minutes: hoursToMinutes(v.hours),
        billable: v.billable,
        notes: v.notes ?? null,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    return ok({ id: data.id });
  });
}

export async function deleteTimeEntryAction(projectId: string, entryId: string): Promise<ActionResult<{ id: string }>> {
  return forProject("projects.read", projectId, [entryId], async (ctx, id, [entry]) => {
    if (!ctx.can("time.manage") && !ctx.can("time.write_own")) return fail("forbidden");
    const supabase = await createClient();
    // RLS limits non-managers to their own entries; another user's id deletes nothing.
    const { data, error } = await supabase
      .from("time_entries")
      .delete()
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .eq("id", entry!)
      .select("id")
      .maybeSingle();
    if (error) return fail(mapDatabaseError(error));
    if (!data) return fail("not_found");
    return ok({ id: data.id });
  });
}

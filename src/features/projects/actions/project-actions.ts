"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { projectCreateSchema, projectStatusSchema, projectUpdateSchema, taskCreateSchema, taskStatusSchema } from "../schemas/project";
import { uuidField } from "@/lib/validation/common";
import type { Permission } from "@/lib/permissions";

export async function createProjectAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getActionContext("projects.write");
    if (!ctx) return fail("unauthenticated");
    const parsed = projectCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;

    const supabase = await createClient();
    // A customer id from the browser is only a reference; the composite FK
    // (organization_id, customer_id) rejects ids from another organization.
    const { data, error } = await supabase
      .from("projects")
      .insert({
        organization_id: ctx.organization.id,
        name: v.name,
        code: v.code ?? null,
        customer_id: v.customerId ?? null,
        status: v.status,
        start_date: v.startDate ?? null,
        end_date: v.endDate ?? null,
        // NUMERIC column: the exact decimal string is sent as-is (no float conversion).
        budget_amount: v.budget ?? null,
        currency: v.currency,
        manager_user_id: ctx.user.id,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) {
      const code = mapDatabaseError(error);
      if (code === "conflict") return fail("conflict", { fieldErrors: { code: "conflict" } });
      return fail(code);
    }
    revalidatePath("/dashboard", "layout");
    return ok({ id: data.id });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

const projectPath = (id: string) => `/dashboard/projects/${id}`;

async function withProjectContext<T>(
  permission: Permission,
  projectId: unknown,
  run: (ctx: NonNullable<Awaited<ReturnType<typeof getActionContext>>>, projectId: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getActionContext(permission);
    if (!ctx) return fail("unauthenticated");
    const id = uuidField.safeParse(projectId);
    if (!id.success) return fail("not_found");
    return await run(ctx, id.data);
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

export async function updateProjectAction(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withProjectContext("projects.write", projectId, async (ctx, id) => {
    const parsed = projectUpdateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update({
        name: v.name,
        code: v.code ?? null,
        customer_id: v.customerId ?? null,
        status: v.status,
        start_date: v.startDate ?? null,
        end_date: v.endDate ?? null,
        budget_amount: v.budget ?? null,
        currency: v.currency,
      })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) {
      const code = mapDatabaseError(error);
      if (code === "conflict") return fail("conflict", { fieldErrors: { code: "conflict" } });
      return fail(code);
    }
    revalidatePath("/dashboard", "layout");
    return ok({ id: data.id });
  });
}

export async function setProjectStatusAction(projectId: string, status: unknown): Promise<ActionResult<{ id: string }>> {
  return withProjectContext("projects.write", projectId, async (ctx, id) => {
    const parsed = projectStatusSchema.safeParse(status);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update({ status: parsed.data })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard", "layout");
    return ok({ id: data.id });
  });
}

/** Soft delete. The database requires projects.delete for it (guard_soft_delete trigger). */
export async function archiveProjectAction(projectId: string): Promise<ActionResult<{ id: string }>> {
  return withProjectContext("projects.delete", projectId, async (ctx, id) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard", "layout");
    return ok({ id: data.id });
  });
}

export async function createProjectTaskAction(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withProjectContext("tasks.write", projectId, async (ctx, id) => {
    const parsed = taskCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    // Composite FKs reject a project or an assignee from another organization.
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        organization_id: ctx.organization.id,
        project_id: id,
        title: v.title,
        priority: v.priority,
        // A date-only deadline is stored at 12:00 UTC so the calendar day never shifts in MD/RO/EU time zones.
        due_at: v.dueDate ? `${v.dueDate}T12:00:00Z` : null,
        assignee_id: v.assigneeId ?? null,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(projectPath(id));
    return ok({ id: data.id });
  });
}

/**
 * Changes a task's status. Managers need tasks.write; an assignee may change
 * only the status of their own task (RLS policy + restrict_assignee_task_update).
 */
export async function setTaskStatusAction(projectId: string, taskId: string, status: unknown): Promise<ActionResult<{ id: string }>> {
  return withProjectContext("tasks.read", projectId, async (ctx, id) => {
    if (!ctx.can("tasks.write") && !ctx.can("tasks.update_assigned")) return fail("forbidden");
    const task = uuidField.safeParse(taskId);
    if (!task.success) return fail("not_found");
    const parsed = taskStatusSchema.safeParse(status);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: parsed.data })
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .eq("id", task.data)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(projectPath(id));
    return ok({ id: data.id });
  });
}

export async function deleteProjectTaskAction(projectId: string, taskId: string): Promise<ActionResult<{ id: string }>> {
  return withProjectContext("tasks.write", projectId, async (ctx, id) => {
    const task = uuidField.safeParse(taskId);
    if (!task.success) return fail("not_found");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("project_id", id)
      .eq("id", task.data)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(projectPath(id));
    return ok({ id: data.id });
  });
}

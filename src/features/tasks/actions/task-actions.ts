"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { uuidField } from "@/lib/validation/common";
import { taskCreateSchema, taskStatusSchema } from "@/features/projects/schemas/project";
import type { Permission } from "@/lib/permissions";

type Ctx = NonNullable<Awaited<ReturnType<typeof getActionContext>>>;

async function withTaskContext<T>(permission: Permission, run: (ctx: Ctx) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const ctx = await getActionContext(permission);
    if (!ctx) return fail("unauthenticated");
    return await run(ctx);
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

/** Tasks show up on the dashboard, the tasks page and project pages. */
const revalidateTasks = () => revalidatePath("/dashboard", "layout");

/** Creates a task, optionally linked to a project. */
export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withTaskContext("tasks.write", async (ctx) => {
    const parsed = taskCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    // Composite FKs reject a project or an assignee from another organization.
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        organization_id: ctx.organization.id,
        project_id: v.projectId ?? null,
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
    revalidateTasks();
    return ok({ id: data.id });
  });
}

/**
 * Changes a task's status. Managers need tasks.write; an assignee may change
 * only the status of their own task (RLS policy + restrict_assignee_task_update).
 */
export async function setTaskStatusAction(taskId: unknown, status: unknown): Promise<ActionResult<{ id: string }>> {
  return withTaskContext("tasks.read", async (ctx) => {
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
      .eq("id", task.data)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateTasks();
    return ok({ id: data.id });
  });
}

/** Soft delete; tasks.write is required by RLS as well. */
export async function deleteTaskAction(taskId: unknown): Promise<ActionResult<{ id: string }>> {
  return withTaskContext("tasks.write", async (ctx) => {
    const task = uuidField.safeParse(taskId);
    if (!task.success) return fail("not_found");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("id", task.data)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateTasks();
    return ok({ id: data.id });
  });
}

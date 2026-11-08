import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export const TASK_VIEWS = ["open", "done", "all"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];
export const TASKS_PAGE_SIZE = 50;

/** Statuses that still need work. */
export const OPEN_TASK_STATUSES = ["todo", "in_progress", "blocked"] as const;
const CLOSED_TASK_STATUSES = ["done", "cancelled"] as const;

export type TaskListItem = Pick<Tables<"tasks">, "id" | "title" | "status" | "priority" | "due_at" | "assignee_id" | "project_id"> & {
  project_name: string | null;
};

export interface TaskFilters {
  view: TaskView;
  /** Only tasks assigned to this user. */
  assigneeId?: string;
  page?: number;
}

export async function listTasks(
  supabase: ServerSupabaseClient,
  organizationId: string,
  filters: TaskFilters,
): Promise<{ rows: TaskListItem[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * TASKS_PAGE_SIZE;
  let query = supabase
    .from("tasks")
    .select("id, title, status, priority, due_at, assignee_id, project_id, projects(name)", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (filters.view === "open") query = query.in("status", [...OPEN_TASK_STATUSES]);
  if (filters.view === "done") query = query.in("status", [...CLOSED_TASK_STATUSES]);
  if (filters.assigneeId) query = query.eq("assignee_id", filters.assigneeId);
  const { data, error, count } = await (filters.view === "done"
    ? query.order("completed_at", { ascending: false, nullsFirst: false })
    : query.order("due_at", { ascending: true, nullsFirst: false })
  )
    .order("created_at", { ascending: false })
    .range(from, from + TASKS_PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  const rows = (data ?? []).map((row) => {
    const { projects, ...rest } = row as typeof row & { projects: { name: string } | null };
    return { ...rest, project_name: projects?.name ?? null };
  });
  return { rows, total: count ?? 0 };
}

export interface TaskCounts {
  open: number;
  overdue: number;
  mine: number;
}

/** KPI counts for the tasks page, computed by the database under the caller's RLS. */
export async function getTaskCounts(supabase: ServerSupabaseClient, organizationId: string, userId: string, now: string): Promise<TaskCounts> {
  const base = () =>
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("status", [...OPEN_TASK_STATUSES]);
  const [open, overdue, mine] = await Promise.all([base(), base().lt("due_at", now), base().eq("assignee_id", userId)]);
  for (const r of [open, overdue, mine]) if (r.error) throw new Error(`Failed to count tasks: ${r.error.message}`);
  return { open: open.count ?? 0, overdue: overdue.count ?? 0, mine: mine.count ?? 0 };
}

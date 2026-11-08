"use client";

import { useTransition } from "react";
import Link from "next/link";
import { CalendarDays, FolderKanban, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { deleteTaskAction, setTaskStatusAction } from "../actions/task-actions";
import { TASK_STATUSES, TASK_STATUS_VARIANT, type TaskPriority, type TaskStatus } from "@/features/projects/schemas/project";

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  assignee_id: string | null;
  project_id?: string | null;
  project_name?: string | null;
}

export const PRIORITY_VARIANT: Record<TaskPriority, "neutral" | "primary" | "warning" | "danger"> = {
  low: "neutral",
  medium: "neutral",
  high: "warning",
  urgent: "danger",
};

/** A date-only deadline (stored at 12:00 UTC) is overdue once its calendar day is in the past. */
export function isTaskOverdue(task: Pick<TaskRow, "status" | "due_at">, today: string): boolean {
  return task.due_at !== null && task.status !== "done" && task.status !== "cancelled" && task.due_at.slice(0, 10) < today;
}

export function TaskList({
  tasks,
  members,
  currentUserId,
  canManage,
  canUpdateAssigned,
  today,
  showProject = false,
}: {
  tasks: TaskRow[];
  members: { userId: string; name: string }[];
  currentUserId: string;
  canManage: boolean;
  canUpdateAssigned: boolean;
  /** Today's date (YYYY-MM-DD) in the organization's time zone, used to flag overdue tasks. */
  today?: string;
  showProject?: boolean;
}) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const memberName = new Map(members.map((m) => [m.userId, m.name]));

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {tasks.map((task) => {
        const canChangeStatus = canManage || (canUpdateAssigned && task.assignee_id === currentUserId);
        const overdue = today ? isTaskOverdue(task, today) : false;
        return (
          <li key={task.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className={task.status === "done" || task.status === "cancelled" ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium"}>
                {task.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <Badge variant={PRIORITY_VARIANT[task.priority]}>{t.tasks.priorities[task.priority]}</Badge>
                <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-danger")}>
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {task.due_at ? formatDate(task.due_at, locale) : t.tasks.noDueDate}
                  {overdue ? ` · ${t.tasks.overdue}` : null}
                </span>
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  {task.assignee_id ? (memberName.get(task.assignee_id) ?? "—") : t.tasks.unassigned}
                </span>
                {showProject ? (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <FolderKanban className="size-3.5 shrink-0" aria-hidden="true" />
                    {task.project_id && task.project_name ? (
                      <Link className="truncate text-primary hover:underline" href={`/dashboard/projects/${task.project_id}`}>
                        {task.project_name}
                      </Link>
                    ) : (
                      t.tasks.noProject
                    )}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canChangeStatus ? (
                <TaskStatusSelect taskId={task.id} status={task.status} />
              ) : (
                <Badge variant={TASK_STATUS_VARIANT[task.status]}>{t.tasks.statuses[task.status]}</Badge>
              )}
              {canManage ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`${t.common.delete}: ${task.title}`}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  }
                  title={t.tasks.deleteTitle}
                  description={t.tasks.deleteBody}
                  confirmLabel={t.common.delete}
                  cancelLabel={t.common.cancel}
                  onConfirm={async () => {
                    await run(() => deleteTaskAction(task.id), t.tasks.deleted);
                  }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TaskStatusSelect({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const { t } = useI18n();
  const run = useRunAction();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(next) => {
        if (next === status) return;
        startTransition(async () => {
          await run(() => setTaskStatusAction(taskId, next), t.tasks.statusChanged);
        });
      }}
    >
      <SelectTrigger className="h-8 w-36" aria-label={t.tasks.status}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {t.tasks.statuses[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

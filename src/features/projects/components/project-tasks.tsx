"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Plus, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { createProjectTaskAction, deleteProjectTaskAction, setTaskStatusAction } from "../actions/project-actions";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_VARIANT,
  taskCreateSchema,
  type TaskCreateInput,
  type TaskPriority,
  type TaskStatus,
} from "../schemas/project";

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  assignee_id: string | null;
}

const PRIORITY_VARIANT: Record<TaskPriority, "neutral" | "primary" | "warning" | "danger"> = {
  low: "neutral",
  medium: "neutral",
  high: "warning",
  urgent: "danger",
};

export function ProjectTasks({
  projectId,
  tasks,
  members,
  currentUserId,
  canManage,
  canUpdateAssigned,
}: {
  projectId: string;
  tasks: TaskRow[];
  members: { userId: string; name: string }[];
  currentUserId: string;
  canManage: boolean;
  canUpdateAssigned: boolean;
}) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const memberName = new Map(members.map((m) => [m.userId, m.name]));
  const done = tasks.filter((task) => task.status === "done").length;
  const open = tasks.filter((task) => task.status !== "cancelled").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.tasks.title}</CardTitle>
        {open > 0 ? <CardDescription>{interpolate(t.tasks.progress, { done, total: open })}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canManage ? <AddTaskForm projectId={projectId} members={members} /> : null}
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.tasks.empty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {tasks.map((task) => {
              const canChangeStatus = canManage || (canUpdateAssigned && task.assignee_id === currentUserId);
              return (
                <li key={task.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className={task.status === "done" || task.status === "cancelled" ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium"}>
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant={PRIORITY_VARIANT[task.priority]}>{t.tasks.priorities[task.priority]}</Badge>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {task.due_at ? formatDate(task.due_at, locale) : t.tasks.noDueDate}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3.5" aria-hidden="true" />
                        {task.assignee_id ? (memberName.get(task.assignee_id) ?? "—") : t.tasks.unassigned}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canChangeStatus ? (
                      <TaskStatusSelect projectId={projectId} taskId={task.id} status={task.status} />
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
                          await run(() => deleteProjectTaskAction(projectId, task.id), t.tasks.deleted);
                        }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TaskStatusSelect({ projectId, taskId, status }: { projectId: string; taskId: string; status: TaskStatus }) {
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
          await run(() => setTaskStatusAction(projectId, taskId, next), t.tasks.statusChanged);
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

function AddTaskForm({ projectId, members }: { projectId: string; members: { userId: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const empty: TaskCreateInput = { title: "", priority: "medium", dueDate: "", assigneeId: "none" };
  const form = useForm<TaskCreateInput>({ resolver: zodResolver(taskCreateSchema), defaultValues: empty });
  const { submit, pending, formError } = useActionForm(form, (values) => createProjectTaskAction(projectId, values), {
    onSuccess: () => {
      form.reset(empty);
      toast.success(t.tasks.added);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <FormField label={t.tasks.taskTitle} error={msg(errors.title?.message)}>
        <Input {...form.register("title")} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t.tasks.priority} error={msg(errors.priority?.message)}>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t.tasks.priorities[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField label={t.tasks.dueDate} optionalLabel={t.common.optional} error={msg(errors.dueDate?.message)}>
          <Input type="date" {...form.register("dueDate")} />
        </FormField>
        <FormField label={t.tasks.assignee} optionalLabel={t.common.optional} error={msg(errors.assigneeId?.message)}>
          <Controller
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <Select value={field.value ?? "none"} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.tasks.unassigned}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          <Plus aria-hidden="true" />
          {t.tasks.add}
        </Button>
      </div>
    </form>
  );
}

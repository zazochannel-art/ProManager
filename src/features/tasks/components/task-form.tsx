"use client";

import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { cn } from "@/lib/utils/cn";
import { createTaskAction } from "../actions/task-actions";
import { TASK_PRIORITIES, taskCreateSchema, type TaskCreateInput } from "@/features/projects/schemas/project";

/**
 * New-task form. With `projectId` the task is linked to that project; with
 * `projects` the user may pick a project (or none).
 */
export function TaskForm({
  members,
  projectId,
  projects,
  onSuccess,
  secondaryAction,
  className,
}: {
  members: { userId: string; name: string }[];
  projectId?: string;
  projects?: { id: string; name: string }[];
  onSuccess: () => void;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const empty: TaskCreateInput = { title: "", priority: "medium", dueDate: "", assigneeId: "none", projectId: projectId ?? "none" };
  const form = useForm<TaskCreateInput>({ resolver: zodResolver(taskCreateSchema), defaultValues: empty });
  const { submit, pending, formError } = useActionForm(form, (values) => createTaskAction(values), {
    onSuccess: () => {
      form.reset(empty);
      onSuccess();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const selectProject = !projectId && projects;
  return (
    <form onSubmit={submit} noValidate className={cn("flex flex-col gap-3", className)}>
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <FormField label={t.tasks.taskTitle} error={msg(errors.title?.message)}>
        <Input {...form.register("title")} />
      </FormField>
      {selectProject ? (
        <FormField label={t.tasks.project} optionalLabel={t.common.optional} error={msg(errors.projectId?.message)}>
          <Controller
            control={form.control}
            name="projectId"
            render={({ field }) => (
              <Select value={field.value ?? "none"} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.tasks.noProject}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      ) : null}
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
      <div className="flex justify-end gap-2">
        {secondaryAction}
        <Button type="submit" size="sm" loading={pending}>
          <Plus aria-hidden="true" />
          {t.tasks.add}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock, Plus, Trash2 } from "lucide-react";
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
import { createPhaseAction, deletePhaseAction, setPhaseProgressAction } from "../actions/project-work-actions";
import { PHASE_PROGRESS_STEPS, phaseCreateSchema, type PhaseCreateInput } from "../schemas/project-work";

export interface PhaseRow {
  id: string;
  name: string;
  planned_start: string | null;
  planned_end: string | null;
  /** Exact decimal string. */
  planned_hours: string | null;
  progress_percent: number;
}

export function ProjectPhases({ projectId, phases, canManage }: { projectId: string; phases: PhaseRow[]; canManage: boolean }) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const average = phases.length ? Math.round(phases.reduce((s, p) => s + p.progress_percent, 0) / phases.length) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.projects.phases.title}</CardTitle>
        <CardDescription>{phases.length ? interpolate(t.projects.phases.overall, { percent: average }) : t.projects.phases.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canManage ? <AddPhaseForm projectId={projectId} /> : null}
        {phases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.projects.phases.empty}</p>
        ) : (
          <ol className="divide-y divide-border rounded-md border border-border">
            {phases.map((phase, index) => (
              <li key={phase.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>
                    {phase.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {phase.planned_start || phase.planned_end ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {formatDate(phase.planned_start, locale)} – {formatDate(phase.planned_end, locale)}
                      </span>
                    ) : null}
                    {phase.planned_hours ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden="true" />
                        {interpolate(t.projects.phases.hours, { hours: phase.planned_hours })}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={phase.progress_percent}
                    aria-label={`${t.projects.phases.progress}: ${phase.name}`}
                  >
                    <div className={phase.progress_percent === 100 ? "h-full rounded-full bg-success" : "h-full rounded-full bg-brand"} style={{ width: `${phase.progress_percent}%` }} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage ? (
                    <ProgressSelect projectId={projectId} phase={phase} />
                  ) : (
                    <span className="text-sm font-medium tabular-nums">{phase.progress_percent}%</span>
                  )}
                  {canManage ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`${t.common.delete}: ${phase.name}`}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      }
                      title={t.projects.phases.deleteTitle}
                      description={t.projects.phases.deleteBody}
                      confirmLabel={t.common.delete}
                      cancelLabel={t.common.cancel}
                      onConfirm={async () => {
                        await run(() => deletePhaseAction(projectId, phase.id), t.projects.phases.deleted);
                      }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressSelect({ projectId, phase }: { projectId: string; phase: PhaseRow }) {
  const { t } = useI18n();
  const run = useRunAction();
  const [pending, startTransition] = useTransition();
  const steps: number[] = [...PHASE_PROGRESS_STEPS];
  if (!steps.includes(phase.progress_percent)) steps.push(phase.progress_percent);
  steps.sort((a, b) => a - b);
  return (
    <Select
      value={String(phase.progress_percent)}
      disabled={pending}
      onValueChange={(next) => {
        if (Number(next) === phase.progress_percent) return;
        startTransition(async () => {
          await run(() => setPhaseProgressAction(projectId, phase.id, Number(next)), t.projects.phases.progressChanged);
        });
      }}
    >
      <SelectTrigger className="h-8 w-24" aria-label={`${t.projects.phases.progress}: ${phase.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {steps.map((s) => (
          <SelectItem key={s} value={String(s)}>
            {s}%
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddPhaseForm({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const empty: PhaseCreateInput = { name: "", plannedStart: "", plannedEnd: "", plannedHours: "" };
  const form = useForm<PhaseCreateInput>({ resolver: zodResolver(phaseCreateSchema), defaultValues: empty });
  const { submit, pending, formError } = useActionForm(form, (values) => createPhaseAction(projectId, values), {
    onSuccess: () => {
      form.reset(empty);
      toast.success(t.projects.phases.added);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <FormField label={t.projects.phases.name} error={msg(errors.name?.message)}>
        <Input {...form.register("name")} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t.projects.phases.plannedStart} optionalLabel={t.common.optional} error={msg(errors.plannedStart?.message)}>
          <Input type="date" {...form.register("plannedStart")} />
        </FormField>
        <FormField label={t.projects.phases.plannedEnd} optionalLabel={t.common.optional} error={msg(errors.plannedEnd?.message)}>
          <Input type="date" {...form.register("plannedEnd")} />
        </FormField>
        <FormField label={t.projects.phases.plannedHours} optionalLabel={t.common.optional} error={msg(errors.plannedHours?.message)}>
          <Input inputMode="decimal" {...form.register("plannedHours")} />
        </FormField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          <Plus aria-hidden="true" />
          {t.projects.phases.add}
        </Button>
      </div>
    </form>
  );
}

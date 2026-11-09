"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { deleteTimeEntryAction, logTimeAction } from "../actions/project-work-actions";
import { minutesToHours, timeEntryCreateSchema, type TimeEntryCreateInput } from "../schemas/project-work";

export interface TimeEntryRow {
  id: string;
  user_id: string;
  started_at: string;
  duration_minutes: number | null;
  billable: boolean;
  notes: string | null;
}

export function ProjectTime({
  projectId,
  entries,
  totalMinutes,
  billableMinutes,
  people,
  currentUserId,
  today,
  canLogOwn,
  canManage,
  seesEveryone,
}: {
  projectId: string;
  entries: TimeEntryRow[];
  totalMinutes: number;
  billableMinutes: number;
  people: { userId: string; name: string }[];
  currentUserId: string;
  /** YYYY-MM-DD in the organization's time zone (default work day). */
  today: string;
  canLogOwn: boolean;
  canManage: boolean;
  /** time.read: the list contains everybody's hours, not only the user's. */
  seesEveryone: boolean;
}) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const nameOf = new Map(people.map((p) => [p.userId, p.name]));
  const canLog = canLogOwn || canManage;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{t.projects.time.title}</CardTitle>
            <CardDescription>{seesEveryone ? t.projects.time.description : t.projects.time.ownOnly}</CardDescription>
          </div>
          {totalMinutes > 0 ? (
            <div className="sm:text-right">
              <p className="text-lg font-semibold tabular-nums">{interpolate(t.projects.time.total, { hours: minutesToHours(totalMinutes) })}</p>
              <p className="text-xs text-muted-foreground">{interpolate(t.projects.time.billableTotal, { hours: minutesToHours(billableMinutes) })}</p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canLog ? <LogTimeForm projectId={projectId} people={canManage ? people : []} currentUserId={currentUserId} today={today} /> : null}
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.projects.time.empty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {entries.map((entry) => {
              const name = nameOf.get(entry.user_id) ?? "—";
              const canDelete = canManage || (canLogOwn && entry.user_id === currentUserId);
              return (
                <li key={entry.id} className="flex items-center gap-3 p-3">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {name}
                      <span className="ml-2 font-normal text-muted-foreground">{formatDate(entry.started_at, locale)}</span>
                    </p>
                    {entry.notes || !entry.billable ? (
                      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        {entry.billable ? null : <Badge variant="neutral">{t.projects.time.nonBillable}</Badge>}
                        {entry.notes ? <span className="truncate">{entry.notes}</span> : null}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {interpolate(t.projects.time.hoursValue, { hours: minutesToHours(entry.duration_minutes ?? 0) })}
                  </span>
                  {canDelete ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`${t.common.delete}: ${name} ${formatDate(entry.started_at, locale)}`}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      }
                      title={t.projects.time.deleteTitle}
                      description={t.projects.time.deleteBody}
                      confirmLabel={t.common.delete}
                      cancelLabel={t.common.cancel}
                      onConfirm={async () => {
                        await run(() => deleteTimeEntryAction(projectId, entry.id), t.projects.time.deleted);
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LogTimeForm({
  projectId,
  people,
  currentUserId,
  today,
}: {
  projectId: string;
  /** Non-empty only for time.manage: lets the user log for a colleague. */
  people: { userId: string; name: string }[];
  currentUserId: string;
  today: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const empty: TimeEntryCreateInput = { date: today, hours: "", notes: "", billable: true, userId: "self" };
  const form = useForm<TimeEntryCreateInput>({ resolver: zodResolver(timeEntryCreateSchema), defaultValues: empty });
  const { submit, pending, formError } = useActionForm(form, (values) => logTimeAction(projectId, values), {
    onSuccess: () => {
      form.reset(empty);
      toast.success(t.projects.time.logged);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const colleagues = people.filter((p) => p.userId !== currentUserId);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <div className={colleagues.length ? "grid gap-3 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2"}>
        {colleagues.length ? (
          <FormField label={t.projects.time.person} error={msg(errors.userId?.message)}>
            <Controller
              control={form.control}
              name="userId"
              render={({ field }) => (
                <Select value={field.value ?? "self"} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">{t.projects.time.me}</SelectItem>
                    {colleagues.map((p) => (
                      <SelectItem key={p.userId} value={p.userId}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        ) : null}
        <FormField label={t.projects.time.date} error={msg(errors.date?.message)}>
          <Input type="date" {...form.register("date")} />
        </FormField>
        <FormField label={t.projects.time.hours} error={msg(errors.hours?.message)}>
          <Input inputMode="decimal" placeholder="8" {...form.register("hours")} />
        </FormField>
      </div>
      <FormField label={t.projects.time.notes} optionalLabel={t.common.optional} error={msg(errors.notes?.message)}>
        <Input {...form.register("notes")} />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Controller
          control={form.control}
          name="billable"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox id={`billable-${projectId}`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              <Label htmlFor={`billable-${projectId}`} className="text-sm font-normal">
                {t.projects.time.billable}
              </Label>
            </div>
          )}
        />
        <Button type="submit" size="sm" loading={pending}>
          <Plus aria-hidden="true" />
          {t.projects.time.log}
        </Button>
      </div>
    </form>
  );
}

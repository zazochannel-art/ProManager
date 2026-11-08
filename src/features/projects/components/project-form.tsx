"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CURRENCIES, type CurrencyCode } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";
import { createProjectAction } from "../actions/project-actions";
import { PROJECT_STATUSES, projectCreateSchema, type ProjectCreateInput } from "../schemas/project";

export function ProjectForm({
  customers,
  defaultCurrency,
  defaultCustomerId,
  onSuccess,
  submitLabel,
  secondaryAction,
  initialValues,
  action = createProjectAction,
}: {
  customers: { id: string; name: string }[];
  defaultCurrency: CurrencyCode;
  defaultCustomerId?: string;
  onSuccess: (id: string) => void;
  submitLabel?: string;
  secondaryAction?: React.ReactNode;
  /** Prefilled values when editing an existing project. */
  initialValues?: Partial<ProjectCreateInput>;
  action?: (values: ProjectCreateInput) => Promise<ActionResult<{ id: string }>>;
}) {
  const { t } = useI18n();
  const form = useForm<ProjectCreateInput>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      name: "",
      code: "",
      customerId: defaultCustomerId ?? "none",
      status: "planned",
      startDate: "",
      endDate: "",
      budget: "",
      currency: defaultCurrency,
      ...initialValues,
    },
  });
  const { submit, pending, formError } = useActionForm(form, action, { onSuccess: ({ id }) => onSuccess(id) });
  const errors = form.formState.errors;
  const msg = (m?: string) => (m === "conflict" ? t.validation.invalidOption : translateValidationMessage(t, m));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" && formError.error !== "conflict" ? (
        <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert>
      ) : null}
      <FormField label={t.projects.name} error={msg(errors.name?.message)}>
        <Input {...form.register("name")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.projects.customer} error={msg(errors.customerId?.message)}>
          <Controller
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <Select value={field.value ?? "none"} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.projects.noCustomer}</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField label={t.projects.status} error={msg(errors.status?.message)}>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t.projects.statuses[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.projects.startDate} optionalLabel={t.common.optional} error={msg(errors.startDate?.message)}>
          <Input type="date" {...form.register("startDate")} />
        </FormField>
        <FormField label={t.projects.endDate} optionalLabel={t.common.optional} error={msg(errors.endDate?.message)}>
          <Input type="date" {...form.register("endDate")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label={t.projects.budget} optionalLabel={t.common.optional} error={msg(errors.budget?.message)}>
          <Input inputMode="decimal" placeholder="0.00" {...form.register("budget")} />
        </FormField>
        <FormField label={t.projects.currency} error={msg(errors.currency?.message)}>
          <Controller
            control={form.control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <FormField label={t.projects.code} optionalLabel={t.common.optional} error={msg(errors.code?.message)}>
        <Input {...form.register("code")} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondaryAction}
        <Button type="submit" loading={pending}>
          {submitLabel ?? t.common.create}
        </Button>
      </div>
    </form>
  );
}

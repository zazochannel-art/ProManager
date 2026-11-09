"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CURRENCIES } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";
import { estimateHeaderSchema, invoiceHeaderSchema, type DocumentKind } from "../schemas/document";

export interface DocumentPickerOptions {
  customers: { id: string; name: string }[];
  projects: { id: string; name: string; customer_id: string | null }[];
}

/** Union of estimate and invoice header fields; each kind uses its own subset. */
export interface DocumentHeaderValues {
  customerId: string;
  projectId?: string;
  currency: (typeof CURRENCIES)[number];
  issueDate: string;
  validUntil?: string;
  dueDate?: string;
  title?: string;
  notes?: string;
  terms?: string;
}

export function DocumentHeaderForm({
  kind,
  options,
  initialValues,
  action,
  onSuccess,
  submitLabel,
  secondaryAction,
}: {
  kind: DocumentKind;
  options: DocumentPickerOptions;
  initialValues: DocumentHeaderValues;
  action: (values: DocumentHeaderValues) => Promise<ActionResult<{ id: string }>>;
  onSuccess: (id: string) => void;
  submitLabel: string;
  secondaryAction?: React.ReactNode;
}) {
  const { t } = useI18n();
  const form = useForm<DocumentHeaderValues>({
    // Both schemas accept the shared fields; the extra field of the other kind is ignored.
    resolver: zodResolver(kind === "estimate" ? estimateHeaderSchema : invoiceHeaderSchema) as never,
    defaultValues: { projectId: "none", validUntil: "", dueDate: "", title: "", notes: "", terms: "", ...initialValues },
  });
  const { submit, pending, formError } = useActionForm(form, action, { onSuccess: ({ id }) => onSuccess(id) });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const customerId = useWatch({ control: form.control, name: "customerId" });
  // Projects of the chosen customer plus projects without a customer.
  const projects = options.projects.filter((p) => !p.customer_id || p.customer_id === customerId);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      {options.customers.length === 0 ? <FormAlert tone="info">{t.invoicing.noCustomers}</FormAlert> : null}
      <FormField label={t.invoicing.customer} error={msg(errors.customerId?.message)}>
        <Controller
          control={form.control}
          name="customerId"
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={(value) => {
                field.onChange(value);
                const project = form.getValues("projectId");
                const stillValid = options.projects.some((p) => p.id === project && (!p.customer_id || p.customer_id === value));
                if (!stillValid) form.setValue("projectId", "none");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.invoicing.chooseCustomer} />
              </SelectTrigger>
              <SelectContent>
                {options.customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      {kind === "estimate" ? (
        <FormField label={t.estimates.docTitle} optionalLabel={t.common.optional} hint={t.estimates.docTitleHint} error={msg(errors.title?.message)}>
          <Input {...form.register("title")} />
        </FormField>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label={t.invoicing.project} optionalLabel={t.common.optional} error={msg(errors.projectId?.message)}>
          <Controller
            control={form.control}
            name="projectId"
            render={({ field }) => (
              <Select value={field.value ?? "none"} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.invoicing.noProject}</SelectItem>
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
        <FormField label={t.invoicing.currency} error={msg(errors.currency?.message)}>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.invoicing.issueDate} error={msg(errors.issueDate?.message)}>
          <Input type="date" {...form.register("issueDate")} />
        </FormField>
        {kind === "estimate" ? (
          <FormField label={t.estimates.validUntil} optionalLabel={t.common.optional} hint={t.estimates.validUntilHint} error={msg(errors.validUntil?.message)}>
            <Input type="date" {...form.register("validUntil")} />
          </FormField>
        ) : (
          <FormField label={t.invoices.dueDate} optionalLabel={t.common.optional} hint={t.invoices.dueDateHint} error={msg(errors.dueDate?.message)}>
            <Input type="date" {...form.register("dueDate")} />
          </FormField>
        )}
      </div>
      <FormField label={t.invoicing.notes} optionalLabel={t.common.optional} error={msg(errors.notes?.message)}>
        <Textarea rows={2} {...form.register("notes")} />
      </FormField>
      <FormField label={t.invoicing.terms} optionalLabel={t.common.optional} error={msg(errors.terms?.message)}>
        <Textarea rows={2} {...form.register("terms")} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondaryAction}
        <Button type="submit" loading={pending} disabled={options.customers.length === 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { createCustomerAction } from "../actions/customer-actions";
import { customerCreateSchema, type CustomerCreateInput } from "../schemas/customer";

export function CustomerForm({
  onSuccess,
  submitLabel,
  secondaryAction,
}: {
  onSuccess: (id: string) => void;
  submitLabel?: string;
  secondaryAction?: React.ReactNode;
}) {
  const { t } = useI18n();
  const form = useForm<CustomerCreateInput>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: { type: "company", name: "", email: "", phone: "", taxId: "" },
  });
  const { submit, pending, formError } = useActionForm(form, createCustomerAction, { onSuccess: ({ id }) => onSuccess(id) });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <FormField label={t.customers.type} error={msg(errors.type?.message)}>
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">{t.customers.types.company}</SelectItem>
                <SelectItem value="individual">{t.customers.types.individual}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormField label={t.customers.name} error={msg(errors.name?.message)}>
        <Input autoComplete="organization" {...form.register("name")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.customers.email} optionalLabel={t.common.optional} error={msg(errors.email?.message)}>
          <Input type="email" inputMode="email" {...form.register("email")} />
        </FormField>
        <FormField label={t.customers.phone} optionalLabel={t.common.optional} error={msg(errors.phone?.message)}>
          <Input type="tel" inputMode="tel" {...form.register("phone")} />
        </FormField>
      </div>
      <FormField label={t.customers.taxId} optionalLabel={t.common.optional} error={msg(errors.taxId?.message)}>
        <Input {...form.register("taxId")} />
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { updateCustomerAction } from "../actions/customer-actions";
import { CUSTOMER_TYPES, customerUpdateSchema, type CustomerUpdateInput } from "../schemas/customer";
import type { CustomerDetail } from "../services/customer-service";

export function EditCustomerDialog({ customer }: { customer: CustomerDetail }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<CustomerUpdateInput>({
    resolver: zodResolver(customerUpdateSchema),
    defaultValues: {
      type: customer.type,
      name: customer.name,
      legalName: customer.legal_name ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      taxId: customer.tax_id ?? "",
      website: customer.website ?? "",
      notes: customer.notes ?? "",
    },
  });
  const { submit, pending, formError } = useActionForm(form, (values) => updateCustomerAction(customer.id, values), {
    onSuccess: () => {
      setOpen(false);
      toast.success(t.customers.updated);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil aria-hidden="true" />
          {t.customers.edit}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.customers.editTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
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
                      {CUSTOMER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t.customers.types[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t.customers.name} error={msg(errors.name?.message)}>
              <Input {...form.register("name")} />
            </FormField>
          </div>
          <FormField label={t.customers.legalName} optionalLabel={t.common.optional} error={msg(errors.legalName?.message)}>
            <Input {...form.register("legalName")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t.customers.email} optionalLabel={t.common.optional} error={msg(errors.email?.message)}>
              <Input type="email" inputMode="email" {...form.register("email")} />
            </FormField>
            <FormField label={t.customers.phone} optionalLabel={t.common.optional} error={msg(errors.phone?.message)}>
              <Input type="tel" inputMode="tel" {...form.register("phone")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t.customers.taxId} optionalLabel={t.common.optional} error={msg(errors.taxId?.message)}>
              <Input {...form.register("taxId")} />
            </FormField>
            <FormField label={t.customers.website} optionalLabel={t.common.optional} error={msg(errors.website?.message)}>
              <Input inputMode="url" placeholder="example.md" {...form.register("website")} />
            </FormField>
          </div>
          <FormField label={t.customers.notes} optionalLabel={t.common.optional} error={msg(errors.notes?.message)}>
            <Textarea rows={4} {...form.register("notes")} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

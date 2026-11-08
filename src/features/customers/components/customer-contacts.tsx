"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Phone, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { initials } from "@/components/shared/detail-hero";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { addContactAction, deleteContactAction } from "../actions/customer-actions";
import { contactSchema, type ContactInput } from "../schemas/customer";
import type { CustomerContact } from "../services/customer-service";

export function CustomerContacts({ customerId, contacts, canWrite }: { customerId: string; contacts: CustomerContact[]; canWrite: boolean }) {
  const { t } = useI18n();
  const run = useRunAction();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{t.customers.contacts.title}</CardTitle>
        {canWrite ? <AddContactDialog customerId={customerId} /> : null}
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.customers.contacts.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary"
                  >
                    {initials(contact.full_name)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {contact.full_name}
                      {contact.is_primary ? <Badge variant="primary">{t.customers.contacts.primary}</Badge> : null}
                    </p>
                    {contact.position ? <p className="text-muted-foreground">{contact.position}</p> : null}
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                      {contact.email ? (
                        <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:${contact.email}`}>
                          <Mail className="size-3.5" aria-hidden="true" />
                          {contact.email}
                        </a>
                      ) : null}
                      {contact.phone ? (
                        <a className="inline-flex items-center gap-1 hover:text-foreground" href={`tel:${contact.phone}`}>
                          <Phone className="size-3.5" aria-hidden="true" />
                          {contact.phone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
                {canWrite ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`${t.common.delete}: ${contact.full_name}`}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    }
                    title={t.customers.contacts.deleteTitle}
                    description={t.customers.contacts.deleteBody}
                    confirmLabel={t.common.delete}
                    cancelLabel={t.common.cancel}
                    onConfirm={async () => {
                      await run(() => deleteContactAction(customerId, contact.id), t.customers.contacts.deleted);
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddContactDialog({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: ContactInput = {
    fullName: "",
    position: "",
    email: "",
    phone: "",
    isPrimary: false,
  };
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: empty,
  });
  const { submit, pending, formError } = useActionForm(form, (values) => addContactAction(customerId, values), {
    onSuccess: () => {
      setOpen(false);
      form.reset(empty);
      toast.success(t.customers.contacts.added);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus aria-hidden="true" />
          {t.customers.contacts.add}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.customers.contacts.add}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
          <FormField label={t.customers.contacts.fullName} error={msg(errors.fullName?.message)}>
            <Input autoComplete="name" {...form.register("fullName")} />
          </FormField>
          <FormField label={t.customers.contacts.position} optionalLabel={t.common.optional} error={msg(errors.position?.message)}>
            <Input {...form.register("position")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t.customers.email} optionalLabel={t.common.optional} error={msg(errors.email?.message)}>
              <Input type="email" inputMode="email" {...form.register("email")} />
            </FormField>
            <FormField label={t.customers.phone} optionalLabel={t.common.optional} error={msg(errors.phone?.message)}>
              <Input type="tel" inputMode="tel" {...form.register("phone")} />
            </FormField>
          </div>
          <Controller
            control={form.control}
            name="isPrimary"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="contact-primary" checked={field.value ?? false} onCheckedChange={(v) => field.onChange(v === true)} />
                <Label htmlFor="contact-primary">{t.customers.contacts.primary}</Label>
              </div>
            )}
          />
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

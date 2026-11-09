"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { createSupplierAction, updateSupplierAction } from "../actions/supplier-actions";
import { supplierSchema, type SupplierInput } from "../schemas/supplier";

const EMPTY: SupplierInput = { name: "", taxId: "", email: "", phone: "", website: "", address: "", notes: "" };

/** Add (supplierId undefined) or edit a supplier. trigger={null} for a dialog opened from a menu. */
export function SupplierDialog({
  supplierId,
  initialValues = EMPTY,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  supplierId?: string;
  initialValues?: SupplierInput;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const editing = Boolean(supplierId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <Plus aria-hidden="true" />
              {t.suppliers.new}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t.suppliers.editTitle : t.suppliers.new}</DialogTitle>
          <DialogDescription>{t.suppliers.formBody}</DialogDescription>
        </DialogHeader>
        {open ? (
          <SupplierForm
            initialValues={initialValues}
            action={(values) => (supplierId ? updateSupplierAction(supplierId, values) : createSupplierAction(values))}
            onSuccess={() => {
              setOpen(false);
              toast.success(editing ? t.suppliers.updated : t.suppliers.created);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  initialValues,
  action,
  onSuccess,
  onCancel,
}: {
  initialValues: SupplierInput;
  action: (values: SupplierInput) => ReturnType<typeof createSupplierAction>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const form = useForm<SupplierInput>({ resolver: zodResolver(supplierSchema) as never, defaultValues: initialValues });
  const { submit, pending, formError } = useActionForm(form, action, { onSuccess });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <FormField label={t.suppliers.fields.name} error={msg(errors.name?.message)}>
          <Input {...form.register("name")} />
        </FormField>
        <FormField label={t.suppliers.fields.taxId} optionalLabel={t.common.optional} error={msg(errors.taxId?.message)}>
          <Input {...form.register("taxId")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.suppliers.fields.phone} optionalLabel={t.common.optional} error={msg(errors.phone?.message)}>
          <Input type="tel" {...form.register("phone")} />
        </FormField>
        <FormField label={t.suppliers.fields.email} optionalLabel={t.common.optional} error={msg(errors.email?.message)}>
          <Input type="email" {...form.register("email")} />
        </FormField>
      </div>
      <FormField label={t.suppliers.fields.website} optionalLabel={t.common.optional} error={msg(errors.website?.message)}>
        <Input {...form.register("website")} />
      </FormField>
      <FormField label={t.suppliers.fields.address} optionalLabel={t.common.optional} error={msg(errors.address?.message)}>
        <Input {...form.register("address")} />
      </FormField>
      <FormField label={t.suppliers.fields.notes} optionalLabel={t.common.optional} hint={t.suppliers.fields.notesHint} error={msg(errors.notes?.message)}>
        <Textarea rows={3} {...form.register("notes")} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={pending}>
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

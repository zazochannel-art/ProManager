"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { CURRENCIES } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { createItemAction, updateItemAction } from "../actions/inventory-actions";
import { itemSchema, type ItemInput } from "../schemas/inventory";

/** Add (itemId undefined) or edit a catalogue item. trigger={null} when opened from a menu. */
export function ItemDialog({
  itemId,
  initialValues,
  suppliers,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  itemId?: string;
  initialValues: ItemInput;
  suppliers: { id: string; name: string }[];
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const editing = Boolean(itemId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <Plus aria-hidden="true" />
              {t.inventory.new}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t.inventory.editTitle : t.inventory.new}</DialogTitle>
          <DialogDescription>{editing ? t.inventory.editBody : t.inventory.newBody}</DialogDescription>
        </DialogHeader>
        {open ? (
          <ItemForm
            suppliers={suppliers}
            initialValues={initialValues}
            action={(values) => (itemId ? updateItemAction(itemId, values) : createItemAction(values))}
            onSuccess={() => {
              setOpen(false);
              toast.success(editing ? t.inventory.updated : t.inventory.created);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  suppliers,
  initialValues,
  action,
  onSuccess,
  onCancel,
}: {
  suppliers: { id: string; name: string }[];
  initialValues: ItemInput;
  action: (values: ItemInput) => ReturnType<typeof createItemAction>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const form = useForm<ItemInput>({ resolver: zodResolver(itemSchema) as never, defaultValues: initialValues });
  const { submit, pending, formError } = useActionForm(form, action, { onSuccess });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <FormField label={t.inventory.fields.name} hint={t.inventory.fields.nameHint} error={msg(errors.name?.message)}>
        <Input {...form.register("name")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label={t.inventory.fields.sku} optionalLabel={t.common.optional} hint={t.inventory.fields.skuHint} error={msg(errors.sku?.message)}>
          <Input {...form.register("sku")} />
        </FormField>
        <FormField label={t.inventory.fields.unit} error={msg(errors.unit?.message)}>
          <Input {...form.register("unit")} list="inventory-units" />
        </FormField>
        <datalist id="inventory-units">
          {["buc", "m", "m²", "m³", "kg", "l", "sac", "set", "rolă"].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_7rem]">
        <FormField label={t.inventory.fields.unitCost} optionalLabel={t.common.optional} error={msg(errors.unitCost?.message)}>
          <Input inputMode="decimal" {...form.register("unitCost")} />
        </FormField>
        <FormField label={t.inventory.fields.salePrice} optionalLabel={t.common.optional} error={msg(errors.salePrice?.message)}>
          <Input inputMode="decimal" {...form.register("salePrice")} />
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
        <FormField label={t.inventory.fields.reorderLevel} optionalLabel={t.common.optional} hint={t.inventory.fields.reorderHint} error={msg(errors.reorderLevel?.message)}>
          <Input inputMode="decimal" {...form.register("reorderLevel")} />
        </FormField>
        <FormField label={t.expenses.fields.supplier} optionalLabel={t.common.optional} error={msg(errors.supplierId?.message)}>
          <Controller
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <Select value={field.value || "none"} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.expenses.noSupplier}</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <FormField label={t.inventory.fields.description} optionalLabel={t.common.optional} error={msg(errors.description?.message)}>
        <Textarea rows={2} {...form.register("description")} />
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

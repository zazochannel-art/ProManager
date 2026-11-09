"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { CURRENCIES } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/currency/format";
import { add, isDecimalString, toFixed } from "@/lib/calculations/decimal";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { createExpenseAction, updateExpenseAction } from "../actions/expense-actions";
import { EXPENSE_KINDS, EXPENSE_PAYMENT_STATUSES, expenseSchema, type ExpenseInput } from "../schemas/finance";

export interface ExpensePickerOptions {
  categories: { id: string; name: string; kind: (typeof EXPENSE_KINDS)[number]; is_active: boolean }[];
  projects: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}

/** Add (expenseId undefined) or edit an expense. */
export function ExpenseDialog({
  options,
  initialValues,
  expenseId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  options: ExpensePickerOptions;
  initialValues: ExpenseInput;
  expenseId?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const editing = Boolean(expenseId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* trigger={null}: opened from elsewhere (the row menu), no button of its own. */}
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <Plus aria-hidden="true" />
              {t.expenses.new}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t.expenses.editTitle : t.expenses.newTitle}</DialogTitle>
          <DialogDescription>{t.expenses.formBody}</DialogDescription>
        </DialogHeader>
        {open ? (
          <ExpenseForm
            options={options}
            initialValues={initialValues}
            action={(values) => (expenseId ? updateExpenseAction(expenseId, values) : createExpenseAction(values))}
            onSuccess={() => {
              setOpen(false);
              toast.success(editing ? t.expenses.updated : t.expenses.created);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  options,
  initialValues,
  action,
  onSuccess,
  onCancel,
}: {
  options: ExpensePickerOptions;
  initialValues: ExpenseInput;
  action: (values: ExpenseInput) => ReturnType<typeof createExpenseAction>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const form = useForm<ExpenseInput>({ resolver: zodResolver(expenseSchema) as never, defaultValues: initialValues });
  const { submit, pending, formError } = useActionForm(form, action, { onSuccess });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const [amount, taxAmount, currency, status, categoryId] = useWatch({ control: form.control, name: ["amount", "taxAmount", "currency", "paymentStatus", "categoryId"] });
  const norm = (v: string | undefined) => (v ?? "").trim().replace(",", ".");
  const preview = isDecimalString(norm(amount) || "0") && isDecimalString(norm(taxAmount) || "0") ? toFixed(add(norm(amount) || "0", norm(taxAmount) || "0")) : null;
  // Hidden categories stay selectable only on the expense that already uses them.
  const categories = options.categories.filter((c) => c.is_active || c.id === categoryId);

  const picker = (name: "categoryId" | "projectId" | "supplierId", none: string, items: { id: string; name: string }[], onChange?: (v: string) => void) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select
          value={field.value || "none"}
          onValueChange={(v) => {
            field.onChange(v);
            onChange?.(v);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{none}</SelectItem>
            {items.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      {formError && !formError.ok && formError.error === "validation" && !formError.fieldErrors ? <FormAlert>{t.common.genericError}</FormAlert> : null}
      <FormField label={t.expenses.fields.description} hint={t.expenses.fields.descriptionHint} error={msg(errors.description?.message)}>
        <Input {...form.register("description")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.expenses.fields.category} optionalLabel={t.common.optional} error={msg(errors.categoryId?.message)}>
          {picker("categoryId", t.expenses.noCategory, categories, (id) => {
            const category = options.categories.find((c) => c.id === id);
            if (category) form.setValue("kind", category.kind);
          })}
        </FormField>
        <FormField label={t.expenses.fields.kind} hint={t.expenses.fields.kindHint} error={msg(errors.kind?.message)}>
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t.expenses.kinds[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.invoicing.project} optionalLabel={t.common.optional} error={msg(errors.projectId?.message)}>
          {picker("projectId", t.invoicing.noProject, options.projects)}
        </FormField>
        <FormField label={t.expenses.fields.supplier} optionalLabel={t.common.optional} error={msg(errors.supplierId?.message)}>
          {picker("supplierId", t.expenses.noSupplier, options.suppliers)}
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_7rem]">
        <FormField label={t.expenses.fields.amount} hint={t.expenses.fields.amountHint} error={msg(errors.amount?.message)}>
          <Input inputMode="decimal" {...form.register("amount")} />
        </FormField>
        <FormField label={t.expenses.fields.taxAmount} optionalLabel={t.common.optional} error={msg(errors.taxAmount?.message)}>
          <Input inputMode="decimal" {...form.register("taxAmount")} />
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
      {preview ? (
        <p className="-mt-2 text-sm text-muted-foreground" aria-live="polite">
          {t.expenses.fields.total}: <span className="font-medium text-foreground tabular-nums">{formatMoney(preview, currency ?? "MDL", locale)}</span>
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t.expenses.fields.date} error={msg(errors.expenseDate?.message)}>
          <Input type="date" {...form.register("expenseDate")} />
        </FormField>
        <FormField label={t.expenses.fields.status} error={msg(errors.paymentStatus?.message)}>
          <Controller
            control={form.control}
            name="paymentStatus"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t.expenses.statuses[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        {status === "paid" ? (
          <FormField label={t.expenses.fields.paidOn} optionalLabel={t.common.optional} error={msg(errors.paidOn?.message)}>
            <Input type="date" {...form.register("paidOn")} />
          </FormField>
        ) : null}
      </div>
      <FormField label={t.expenses.fields.reference} optionalLabel={t.common.optional} hint={t.expenses.fields.referenceHint} error={msg(errors.reference?.message)}>
        <Input {...form.register("reference")} />
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Eye, EyeOff, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";
import {
  createExpenseCategoryAction,
  deleteExpenseCategoryAction,
  setExpenseCategoryActiveAction,
  updateExpenseCategoryAction,
} from "../actions/expense-actions";
import { EXPENSE_KINDS, expenseCategorySchema, type ExpenseCategoryInput, type ExpenseKind } from "../schemas/finance";

export interface CategoryItem {
  id: string;
  name: string;
  kind: ExpenseKind;
  is_active: boolean;
}

/** Add, rename, hide and delete expense categories (expenses.write; delete needs expenses.delete). */
export function ExpenseCategoriesDialog({ categories, canDelete }: { categories: CategoryItem[]; canDelete: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult<unknown>>, success: string, conflictMessage?: string) =>
    startTransition(async () => {
      let result: ActionResult<unknown>;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: "server" };
      }
      if (!result.ok) {
        toast.error(result.error === "conflict" && conflictMessage ? conflictMessage : actionErrorMessage(t, result.error));
        return;
      }
      toast.success(success);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditingId(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Tags aria-hidden="true" />
          {t.expenses.categories.manage}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.expenses.categories.title}</DialogTitle>
          <DialogDescription>{t.expenses.categories.description}</DialogDescription>
        </DialogHeader>
        <CategoryForm
          key="new"
          initial={{ name: "", kind: "material" }}
          action={createExpenseCategoryAction}
          submitLabel={t.expenses.categories.add}
          onDone={() => {
            toast.success(t.expenses.categories.created);
            router.refresh();
          }}
          resetOnDone
        />
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.expenses.categories.empty}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {categories.map((c) =>
              editingId === c.id ? (
                <li key={c.id} className="p-3">
                  <CategoryForm
                    initial={{ name: c.name, kind: c.kind }}
                    action={(values) => updateExpenseCategoryAction(c.id, values)}
                    submitLabel={t.common.save}
                    onDone={() => {
                      setEditingId(null);
                      toast.success(t.expenses.categories.updated);
                      router.refresh();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={c.is_active ? "truncate text-sm font-medium" : "truncate text-sm font-medium text-muted-foreground"}>{c.name}</p>
                    <p className="text-xs text-muted-foreground">{t.expenses.kinds[c.kind]}</p>
                  </div>
                  {!c.is_active ? <Badge variant="outline">{t.expenses.categories.hidden}</Badge> : null}
                  <Button variant="ghost" size="icon-sm" aria-label={`${t.common.edit}: ${c.name}`} onClick={() => setEditingId(c.id)} disabled={pending}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${c.is_active ? t.expenses.categories.hide : t.expenses.categories.show}: ${c.name}`}
                    disabled={pending}
                    onClick={() => run(() => setExpenseCategoryActiveAction(c.id, !c.is_active), c.is_active ? t.expenses.categories.hiddenDone : t.expenses.categories.shownDone)}
                  >
                    {c.is_active ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </Button>
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t.common.delete}: ${c.name}`}
                      disabled={pending}
                      onClick={() => run(() => deleteExpenseCategoryAction(c.id), t.expenses.categories.deleted, interpolate(t.expenses.categories.inUse, { name: c.name }))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  initial,
  action,
  submitLabel,
  onDone,
  onCancel,
  resetOnDone = false,
}: {
  initial: ExpenseCategoryInput;
  action: (values: ExpenseCategoryInput) => Promise<ActionResult<{ id: string }>>;
  submitLabel: string;
  onDone: () => void;
  onCancel?: () => void;
  resetOnDone?: boolean;
}) {
  const { t } = useI18n();
  const form = useForm<ExpenseCategoryInput>({ resolver: zodResolver(expenseCategorySchema), defaultValues: initial });
  const { submit, pending, formError } = useActionForm(form, action, {
    onSuccess: () => {
      if (resetOnDone) form.reset({ ...initial, kind: form.getValues("kind") });
      onDone();
    },
  });
  const error = translateValidationMessage(t, form.formState.errors.name?.message ?? form.formState.errors.kind?.message);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label={t.expenses.categories.name} placeholder={t.expenses.categories.namePlaceholder} aria-invalid={error ? true : undefined} className="sm:flex-1" {...form.register("name")} />
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-label={t.expenses.fields.kind} className="sm:w-44">
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
        <div className="flex gap-2">
          <Button type="submit" loading={pending} className="flex-1 sm:flex-none">
            {onCancel ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {submitLabel}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" size="icon" aria-label={t.common.cancel} onClick={onCancel}>
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}

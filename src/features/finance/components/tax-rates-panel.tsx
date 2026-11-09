"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, Pencil, Plus, Star, Trash2, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";
import { createTaxRateAction, deleteTaxRateAction, setDefaultTaxRateAction, setTaxRateActiveAction, updateTaxRateAction } from "../actions/tax-rate-actions";
import { taxRateSchema, type TaxRateInput } from "../schemas/finance";

export interface TaxRateItem {
  id: string;
  name: string;
  rate: string;
  valid_from: string;
  valid_to: string | null;
  is_default: boolean;
  is_active: boolean;
}

type Editing = { mode: "create" } | { mode: "edit"; rate: TaxRateItem } | { mode: "delete"; rate: TaxRateItem } | null;

/** VAT rates offered on estimate and invoice lines (Settings → VAT). */
export function TaxRatesPanel({ rates, canManage, today }: { rates: TaxRateItem[]; canManage: boolean; today: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
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
      setEditing(null);
      router.refresh();
    });

  const period = (r: TaxRateItem) =>
    r.valid_to ? interpolate(t.taxRates.period, { from: formatDate(r.valid_from, locale), to: formatDate(r.valid_to, locale) }) : interpolate(t.taxRates.openEnded, { from: formatDate(r.valid_from, locale) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">{t.taxRates.description}</p>
        {canManage ? (
          <Button onClick={() => setEditing({ mode: "create" })} className="self-start">
            <Plus aria-hidden="true" />
            {t.taxRates.add}
          </Button>
        ) : null}
      </div>

      {rates.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{t.taxRates.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-16 shrink-0 text-lg font-semibold tabular-nums text-foreground">{r.rate}%</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className={r.is_active ? undefined : "text-muted-foreground"}>{r.name}</span>
                  {r.is_default ? <Badge variant="primary">{t.taxRates.default}</Badge> : null}
                  {!r.is_active ? <Badge variant="outline">{t.taxRates.inactive}</Badge> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{period(r)}</p>
              </div>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={interpolate(t.taxRates.actions, { name: r.name })} disabled={pending}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ mode: "edit", rate: r })}>
                      <Pencil aria-hidden="true" />
                      {t.taxRates.edit}
                    </DropdownMenuItem>
                    {!r.is_default ? (
                      <DropdownMenuItem onSelect={() => run(() => setDefaultTaxRateAction(r.id), t.taxRates.defaultSet)}>
                        <Star aria-hidden="true" />
                        {t.taxRates.setDefault}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => run(() => setTaxRateActiveAction(r.id, !r.is_active), r.is_active ? t.taxRates.deactivated : t.taxRates.activated)}>
                      <Power aria-hidden="true" />
                      {r.is_active ? t.taxRates.deactivate : t.taxRates.activate}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-danger" onSelect={() => setEditing({ mode: "delete", rate: r })}>
                      <Trash2 aria-hidden="true" />
                      {t.common.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing?.mode === "create" || editing?.mode === "edit"} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent closeLabel={t.common.close}>
          <DialogHeader>
            <DialogTitle>{editing?.mode === "edit" ? t.taxRates.editTitle : t.taxRates.addTitle}</DialogTitle>
            <DialogDescription>{t.taxRates.formBody}</DialogDescription>
          </DialogHeader>
          {editing?.mode === "create" || editing?.mode === "edit" ? (
            <TaxRateForm
              key={editing.mode === "edit" ? editing.rate.id : "new"}
              initial={
                editing.mode === "edit"
                  ? { name: editing.rate.name, rate: editing.rate.rate, validFrom: editing.rate.valid_from, validTo: editing.rate.valid_to ?? "", isDefault: editing.rate.is_default }
                  : { name: "", rate: "", validFrom: today, validTo: "", isDefault: rates.every((r) => !r.is_default) }
              }
              action={(values) => (editing.mode === "edit" ? updateTaxRateAction(editing.rate.id, values) : createTaxRateAction(values))}
              onDone={() => {
                toast.success(editing.mode === "edit" ? t.taxRates.updated : t.taxRates.created);
                setEditing(null);
                router.refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editing?.mode === "delete"} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>{t.taxRates.deleteTitle}</DialogTitle>
            <DialogDescription>{t.taxRates.deleteBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => editing?.mode === "delete" && run(() => deleteTaxRateAction(editing.rate.id), t.taxRates.deleted, t.taxRates.inUse)}
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaxRateForm({
  initial,
  action,
  onDone,
  onCancel,
}: {
  initial: TaxRateInput;
  action: (values: TaxRateInput) => Promise<ActionResult<{ id: string }>>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const form = useForm<TaxRateInput>({ resolver: zodResolver(taxRateSchema) as never, defaultValues: initial });
  const { submit, pending, formError } = useActionForm(form, action, { onSuccess: onDone });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <FormField label={t.taxRates.name} hint={t.taxRates.nameHint} error={msg(errors.name?.message)}>
          <Input {...form.register("name")} />
        </FormField>
        <FormField label={t.taxRates.rate} error={msg(errors.rate?.message)}>
          <Input inputMode="decimal" {...form.register("rate")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.taxRates.validFrom} error={msg(errors.validFrom?.message)}>
          <Input type="date" {...form.register("validFrom")} />
        </FormField>
        <FormField label={t.taxRates.validTo} optionalLabel={t.common.optional} hint={t.taxRates.validToHint} error={msg(errors.validTo?.message)}>
          <Input type="date" {...form.register("validTo")} />
        </FormField>
      </div>
      <Controller
        control={form.control}
        name="isDefault"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Checkbox id="tax-rate-default" checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
            <Label htmlFor="tax-rate-default" className="font-normal">
              {t.taxRates.isDefault}
            </Label>
          </div>
        )}
      />
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

"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { calculateLine } from "@/lib/calculations/documents";
import { formatMoney, formatNumber } from "@/lib/currency/format";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { deleteLineAction, saveLineAction } from "../actions/line-actions";
import { lineSchema, type DocumentKind, type LineInput } from "../schemas/document";
import { useDocumentAction } from "./use-document-action";

export interface LineRow {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  tax_rate: string;
  line_total: string;
}

export interface DocumentTotalsRow {
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
}

export function DocumentLines({
  kind,
  documentId,
  currency,
  lines,
  totals,
  editable,
  lockedMessage,
  defaultTaxRate,
  taxRates,
}: {
  kind: DocumentKind;
  documentId: string;
  currency: string;
  lines: LineRow[];
  totals: DocumentTotalsRow;
  /** The document state allows changes AND the user may write. */
  editable: boolean;
  /** Shown when the document state locks the lines. */
  lockedMessage?: string;
  defaultTaxRate: string;
  taxRates: { id: string; name: string; rate: string }[];
}) {
  const { t, locale } = useI18n();
  const run = useDocumentAction();
  const [editing, setEditing] = useState<LineRow | null>(null);
  const money = (v: string) => formatMoney(v, currency, locale);
  const qty = (v: string) => formatNumber(v, locale, v.includes(".") ? Math.min(3, v.split(".")[1]!.length) : 0);
  const hasDiscount = lines.some((l) => Number(l.discount_percent) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.invoicing.lines.title}</CardTitle>
        <CardDescription>{t.invoicing.lines.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lockedMessage ? (
          <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {lockedMessage}
          </p>
        ) : null}
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.invoicing.lines.empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs font-medium whitespace-nowrap text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">{t.invoicing.lines.item}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.invoicing.lines.quantity}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.invoicing.lines.unitPrice}</th>
                  {hasDiscount ? <th className="px-3 py-2 text-right font-medium">{t.invoicing.lines.discountPercent}</th> : null}
                  <th className="px-3 py-2 text-right font-medium">{t.invoicing.lines.taxRate}</th>
                  <th className="px-3 py-2 text-right font-medium">{t.invoicing.lines.lineTotal}</th>
                  {editable ? <th className="w-20 px-2 py-2" aria-label={t.common.actions} /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line, index) => (
                  <tr key={line.id} className={editing?.id === line.id ? "bg-primary-soft/40" : undefined}>
                    <td className="px-3 py-2.5 align-top text-muted-foreground tabular-nums">{index + 1}</td>
                    <td className="px-3 py-2.5 align-top whitespace-pre-line break-words">{line.description}</td>
                    <td className="px-3 py-2.5 text-right align-top whitespace-nowrap tabular-nums">
                      {qty(line.quantity)} <span className="text-muted-foreground">{line.unit}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top whitespace-nowrap tabular-nums">{money(line.unit_price)}</td>
                    {hasDiscount ? <td className="px-3 py-2.5 text-right align-top tabular-nums">{Number(line.discount_percent) > 0 ? `${line.discount_percent}%` : "—"}</td> : null}
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">{line.tax_rate}%</td>
                    <td className="px-3 py-2.5 text-right align-top font-medium whitespace-nowrap tabular-nums">{money(line.line_total)}</td>
                    {editable ? (
                      <td className="px-2 py-1.5 text-right align-top whitespace-nowrap">
                        <Button variant="ghost" size="icon-sm" aria-label={`${t.invoicing.lines.editLine}: ${index + 1}`} onClick={() => setEditing(line)}>
                          <Pencil aria-hidden="true" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`${t.common.delete}: ${index + 1}`}>
                              <Trash2 aria-hidden="true" />
                            </Button>
                          }
                          title={t.invoicing.lines.deleteTitle}
                          description={t.invoicing.lines.deleteBody}
                          confirmLabel={t.common.delete}
                          cancelLabel={t.common.cancel}
                          onConfirm={async () => {
                            if (editing?.id === line.id) setEditing(null);
                            await run(() => deleteLineAction(kind, documentId, line.id), t.invoicing.lines.deleted);
                          }}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DocumentTotals totals={totals} currency={currency} />

        {editable ? (
          <LineForm
            key={editing?.id ?? "new"}
            kind={kind}
            documentId={documentId}
            currency={currency}
            line={editing}
            position={editing ? lines.findIndex((l) => l.id === editing.id) + 1 : null}
            defaultTaxRate={defaultTaxRate}
            taxRates={taxRates}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DocumentTotals({ totals, currency }: { totals: DocumentTotalsRow; currency: string }) {
  const { t, locale } = useI18n();
  const money = (v: string) => formatMoney(v, currency, locale);
  const rows = [
    { label: t.invoicing.subtotal, value: totals.subtotal, show: true },
    { label: t.invoicing.discount, value: `−${money(totals.discount_total)}`, raw: true, show: Number(totals.discount_total) > 0 },
    { label: t.invoicing.tax, value: totals.tax_total, show: true },
  ];
  return (
    <dl className="ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
      {rows
        .filter((r) => r.show)
        .map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="tabular-nums">{r.raw ? r.value : money(r.value)}</dd>
          </div>
        ))}
      <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
        <dt>{t.invoicing.total}</dt>
        <dd className="tabular-nums">{money(totals.total)}</dd>
      </div>
    </dl>
  );
}

function LineForm({
  kind,
  documentId,
  currency,
  line,
  position,
  defaultTaxRate,
  taxRates,
  onDone,
}: {
  kind: DocumentKind;
  documentId: string;
  currency: string;
  line: LineRow | null;
  position: number | null;
  defaultTaxRate: string;
  taxRates: { id: string; name: string; rate: string }[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const listId = useId();
  const empty: LineInput = { description: "", unit: t.invoicing.lines.defaultUnit, quantity: "1", unitPrice: "", discountPercent: "0", taxRate: defaultTaxRate };
  const form = useForm<LineInput>({
    resolver: zodResolver(lineSchema),
    defaultValues: line
      ? { description: line.description, unit: line.unit, quantity: line.quantity, unitPrice: line.unit_price, discountPercent: line.discount_percent, taxRate: line.tax_rate }
      : empty,
  });
  const { submit, pending, formError } = useActionForm(form, (values) => saveLineAction(kind, documentId, line?.id ?? null, values), {
    onSuccess: () => {
      toast.success(line ? t.invoicing.lines.updated : t.invoicing.lines.added);
      form.reset(empty);
      onDone();
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      {position ? <p className="text-sm font-medium">{interpolate(t.invoicing.lines.editing, { position })}</p> : null}
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      {formError && !formError.ok && formError.error === "validation" && !formError.fieldErrors ? <FormAlert>{t.invoicing.stateError}</FormAlert> : null}
      <FormField label={t.invoicing.lines.item} error={msg(errors.description?.message)}>
        <Input {...form.register("description")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <FormField label={t.invoicing.lines.quantity} error={msg(errors.quantity?.message)}>
          <Input inputMode="decimal" {...form.register("quantity")} />
        </FormField>
        <FormField label={t.invoicing.lines.unit} error={msg(errors.unit?.message)}>
          <Input {...form.register("unit")} />
        </FormField>
        <FormField label={t.invoicing.lines.unitPrice} error={msg(errors.unitPrice?.message)}>
          <Input inputMode="decimal" placeholder="0.00" {...form.register("unitPrice")} />
        </FormField>
        <FormField label={t.invoicing.lines.discountPercent} error={msg(errors.discountPercent?.message)}>
          <Input inputMode="decimal" {...form.register("discountPercent")} />
        </FormField>
        <FormField
          label={t.invoicing.lines.taxRate}
          hint={taxRates.length === 0 ? t.invoicing.lines.noTaxRates : taxRates.map((r) => `${r.name} ${r.rate}%`).join(" · ")}
          error={msg(errors.taxRate?.message)}
        >
          <Input inputMode="decimal" list={listId} {...form.register("taxRate")} />
        </FormField>
        <datalist id={listId}>
          {taxRates.map((r) => (
            <option key={r.id} value={r.rate}>
              {r.name}
            </option>
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <LinePreview control={form.control} currency={currency} />
        <div className="flex gap-2 sm:justify-end">
          {line ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                form.reset(empty);
                onDone();
              }}
            >
              {t.invoicing.lines.cancelEdit}
            </Button>
          ) : null}
          <Button type="submit" size="sm" loading={pending}>
            {line ? null : <Plus aria-hidden="true" />}
            {line ? t.invoicing.lines.save : t.invoicing.lines.add}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Live preview with the same formulas as the database (src/lib/calculations/documents.ts). */
function LinePreview({ control, currency }: { control: Control<LineInput>; currency: string }) {
  const { t, locale } = useI18n();
  const [quantity, unitPrice, discountPercent, taxRate] = useWatch({ control, name: ["quantity", "unitPrice", "discountPercent", "taxRate"] });
  let total: string | null = null;
  try {
    const n = (v: string | undefined) => (v ?? "").trim().replace(",", ".");
    if (n(quantity) && n(unitPrice)) {
      total = calculateLine({ quantity: n(quantity), unitPrice: n(unitPrice), discountPercent: n(discountPercent) || "0", taxRate: n(taxRate) || "0" }).lineTotal;
    }
  } catch {
    total = null;
  }
  return (
    <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
      {total ? interpolate(t.invoicing.lines.preview, { amount: formatMoney(total, currency, locale) }) : " "}
    </p>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, Plus, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/currency/format";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { recordInvoicePaymentAction, voidPaymentAction } from "../actions/invoice-actions";
import { PAYMENT_METHODS, paymentSchema, type PaymentInput, type PaymentMethod } from "../schemas/document";
import { ReasonDialog } from "./reason-dialog";

export interface PaymentRow {
  allocation_id: string;
  payment_id: string;
  number: string;
  amount: string;
  method: string;
  paid_on: string;
  reference: string | null;
  voided_at: string | null;
}

const isMethod = (v: string): v is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(v);

export function InvoicePayments({
  invoiceId,
  invoiceNumber,
  currency,
  balanceDue,
  payments,
  openForPayment,
  issued,
  canWrite,
  today,
}: {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  balanceDue: string;
  payments: PaymentRow[];
  openForPayment: boolean;
  /** False for drafts: payments start after issuing. */
  issued: boolean;
  canWrite: boolean;
  today: string;
}) {
  const { t, locale } = useI18n();
  const money = (v: string) => formatMoney(v, currency, locale);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.invoices.payments.title}</CardTitle>
        <CardDescription>{issued ? t.invoices.payments.description : t.invoices.payments.notIssued}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {issued && payments.length === 0 ? <p className="text-sm text-muted-foreground">{t.invoices.payments.empty}</p> : null}
        {payments.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {payments.map((p) => (
              <li key={p.allocation_id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className={p.voided_at ? "text-sm font-medium tabular-nums line-through text-muted-foreground" : "text-sm font-medium tabular-nums"}>{money(p.amount)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(p.paid_on, locale)} · {isMethod(p.method) ? t.invoices.payments.methods[p.method] : p.method} · <span className="font-mono">{p.number}</span>
                  </p>
                  {p.reference ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.reference}</p> : null}
                </div>
                {p.voided_at ? (
                  <Badge variant="danger">{t.invoices.payments.voidedLabel}</Badge>
                ) : canWrite ? (
                  <ReasonDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`${t.invoices.payments.void}: ${p.number}`}>
                        <Undo2 aria-hidden="true" />
                      </Button>
                    }
                    title={t.invoices.payments.voidTitle}
                    description={t.invoices.payments.voidBody}
                    label={t.invoices.voidReason}
                    confirmLabel={t.invoices.payments.void}
                    successMessage={t.invoices.payments.voided}
                    action={(values) => voidPaymentAction(invoiceId, p.payment_id, values)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canWrite && openForPayment ? (
          <RecordPaymentDialog invoiceId={invoiceId} invoiceNumber={invoiceNumber} currency={currency} balanceDue={balanceDue} today={today} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function RecordPaymentDialog({ invoiceId, invoiceNumber, currency, balanceDue, today }: { invoiceId: string; invoiceNumber: string; currency: string; balanceDue: string; today: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults = (): PaymentInput => ({ amount: balanceDue, method: "bank_transfer", paidOn: today, reference: "", idempotencyKey: newKey() });
  const form = useForm<PaymentInput>({ resolver: zodResolver(paymentSchema), defaultValues: defaults() });
  const { submit, pending, formError } = useActionForm(form, (values) => recordInvoicePaymentAction(invoiceId, values), {
    onSuccess: () => {
      setOpen(false);
      toast.success(t.invoices.payments.recorded);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A fresh idempotency key per dialog session: a double submit records one payment.
        if (next) form.reset(defaults());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {t.invoices.payments.record}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.invoices.payments.recordTitle}</DialogTitle>
          <DialogDescription>{interpolate(t.invoices.payments.recordBody, { number: invoiceNumber })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
          {formError && !formError.ok && formError.error === "validation" && !formError.fieldErrors ? <FormAlert>{t.invoicing.stateError}</FormAlert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={`${t.invoices.payments.amount} (${currency})`}
              hint={interpolate(t.invoices.payments.remaining, { amount: formatMoney(balanceDue, currency, locale) })}
              error={msg(errors.amount?.message)}
            >
              <Input inputMode="decimal" {...form.register("amount")} />
            </FormField>
            <FormField label={t.invoices.payments.paidOn} error={msg(errors.paidOn?.message)}>
              <Input type="date" {...form.register("paidOn")} />
            </FormField>
          </div>
          <FormField label={t.invoices.payments.method} error={msg(errors.method?.message)}>
            <Controller
              control={form.control}
              name="method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t.invoices.payments.methods[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField label={t.invoices.payments.reference} optionalLabel={t.common.optional} hint={t.invoices.payments.referenceHint} error={msg(errors.reference?.message)}>
            <Input {...form.register("reference")} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              <Banknote aria-hidden="true" />
              {t.invoices.payments.record}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

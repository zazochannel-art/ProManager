"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { createPortalAccessAction } from "../actions/portal-actions";
import { PORTAL_VALIDITY_DAYS, portalAccessSchema, type PortalAccessInput } from "../schemas/portal";

type Customer = { id: string; name: string; email: string | null };
type Result = { url: string; email: string; emailSent: boolean };

/** Creates a portal link for a customer, then shows it once so it can be copied. */
export function PortalAccessDialog({ customers }: { customers: Customer[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) setResult(null);
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button disabled={customers.length === 0} title={customers.length === 0 ? t.clientPortal.noCustomers : undefined}>
          <Plus aria-hidden="true" />
          {t.clientPortal.new}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-lg">
        {result ? (
          <PortalLinkResult result={result} onDone={() => change(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t.clientPortal.formTitle}</DialogTitle>
              <DialogDescription>{t.clientPortal.formBody}</DialogDescription>
            </DialogHeader>
            {open ? (
              <PortalAccessForm
                customers={customers}
                onCancel={() => change(false)}
                onSuccess={(data) => {
                  setResult(data);
                  router.refresh();
                }}
              />
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PortalAccessForm({ customers, onCancel, onSuccess }: { customers: Customer[]; onCancel: () => void; onSuccess: (data: Result) => void }) {
  const { t } = useI18n();
  const form = useForm<PortalAccessInput>({
    resolver: zodResolver(portalAccessSchema) as never,
    defaultValues: { customerId: "", email: "", canViewInvoices: true, canViewEstimates: true, canViewProjects: true, validDays: 90 },
  });
  const { submit, pending, formError } = useActionForm(form, createPortalAccessAction, { onSuccess });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const shares = [
    ["canViewInvoices", t.clientPortal.shareInvoices],
    ["canViewEstimates", t.clientPortal.shareEstimates],
    ["canViewProjects", t.clientPortal.shareProjects],
  ] as const;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <FormField label={t.clientPortal.customer} error={msg(errors.customerId?.message)}>
        <Controller
          control={form.control}
          name="customerId"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(id) => {
                field.onChange(id);
                // Prefill the customer's e-mail, unless one was already typed.
                const email = customers.find((c) => c.id === id)?.email;
                if (email && !form.getValues("email")) form.setValue("email", email, { shouldValidate: true });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.clientPortal.customerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormField label={t.clientPortal.email} hint={t.clientPortal.emailHint} error={msg(errors.email?.message)}>
        <Input type="email" inputMode="email" autoComplete="off" {...form.register("email")} />
      </FormField>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-medium">{t.clientPortal.shares}</legend>
        {shares.map(([name, label]) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <div className="flex items-center gap-2.5">
                <Checkbox id={`portal-${name}`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <Label htmlFor={`portal-${name}`} className="font-normal">
                  {label}
                </Label>
              </div>
            )}
          />
        ))}
        {errors.canViewInvoices?.message ? <p className="text-sm text-danger">{msg(errors.canViewInvoices.message)}</p> : null}
      </fieldset>
      <FormField label={t.clientPortal.validity} error={msg(errors.validDays?.message)}>
        <Controller
          control={form.control}
          name="validDays"
          render={({ field }) => (
            <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PORTAL_VALIDITY_DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {interpolate(t.clientPortal.validityOption, { days: d })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={pending}>
          {t.clientPortal.create}
        </Button>
      </div>
    </form>
  );
}

export function PortalLinkResult({ result, onDone }: { result: Result; onDone: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.clientPortal.resultTitle}</DialogTitle>
        <DialogDescription>{result.emailSent ? interpolate(t.clientPortal.emailSent, { email: result.email }) : t.clientPortal.emailNotSent}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input readOnly value={result.url} aria-label={t.clientPortal.copy} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.url);
                setCopied(true);
                toast.success(t.clientPortal.copied);
              } catch {
                toast.error(t.common.genericError);
              }
            }}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {t.clientPortal.copy}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t.clientPortal.linkOnce}</p>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>{t.clientPortal.done}</Button>
      </DialogFooter>
    </>
  );
}

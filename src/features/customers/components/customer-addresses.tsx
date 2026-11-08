"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { addAddressAction, deleteAddressAction } from "../actions/customer-actions";
import { ADDRESS_TYPES, addressSchema, type AddressInput, type AddressType } from "../schemas/customer";
import type { CustomerAddress } from "../services/customer-service";

export function formatAddress(a: Pick<CustomerAddress, "line1" | "line2" | "city" | "region" | "postal_code" | "country_code">): string {
  const cityLine = [a.postal_code, a.city].filter(Boolean).join(" ");
  return [a.line1, a.line2, cityLine, a.region, a.country_code].filter(Boolean).join(", ");
}

export function CustomerAddresses({
  customerId,
  addresses,
  canWrite,
  defaultCountry,
}: {
  customerId: string;
  addresses: CustomerAddress[];
  canWrite: boolean;
  defaultCountry: string;
}) {
  const { t } = useI18n();
  const run = useRunAction();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{t.customers.addresses.title}</CardTitle>
        {canWrite ? <AddAddressDialog customerId={customerId} defaultCountry={defaultCountry} /> : null}
      </CardHeader>
      <CardContent>
        {addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.customers.addresses.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {addresses.map((address) => (
              <li key={address.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {t.customers.addresses.types[address.type as AddressType] ?? address.type}
                    {address.is_default ? <Badge variant="outline">{t.customers.addresses.defaultBadge}</Badge> : null}
                  </p>
                  <p className="text-muted-foreground">{formatAddress(address)}</p>
                </div>
                {canWrite ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`${t.common.delete}: ${address.line1}`}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    }
                    title={t.customers.addresses.deleteTitle}
                    description={t.customers.addresses.deleteBody}
                    confirmLabel={t.common.delete}
                    cancelLabel={t.common.cancel}
                    onConfirm={async () => {
                      await run(() => deleteAddressAction(customerId, address.id), t.customers.addresses.deleted);
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

function AddAddressDialog({ customerId, defaultCountry }: { customerId: string; defaultCountry: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: AddressInput = { type: "billing", line1: "", line2: "", city: "", region: "", postalCode: "", countryCode: defaultCountry, isDefault: true };
  const form = useForm<AddressInput>({ resolver: zodResolver(addressSchema), defaultValues: empty });
  const { submit, pending, formError } = useActionForm(form, (values) => addAddressAction(customerId, values), {
    onSuccess: () => {
      setOpen(false);
      form.reset(empty);
      toast.success(t.customers.addresses.added);
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
          {t.customers.addresses.add}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.customers.addresses.add}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
          <FormField label={t.customers.addresses.type} error={msg(errors.type?.message)}>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADDRESS_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t.customers.addresses.types[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField label={t.customers.addresses.line1} error={msg(errors.line1?.message)}>
            <Input autoComplete="address-line1" {...form.register("line1")} />
          </FormField>
          <FormField label={t.customers.addresses.line2} optionalLabel={t.common.optional} error={msg(errors.line2?.message)}>
            <Input autoComplete="address-line2" {...form.register("line2")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <FormField label={t.customers.addresses.city} optionalLabel={t.common.optional} error={msg(errors.city?.message)}>
              <Input autoComplete="address-level2" {...form.register("city")} />
            </FormField>
            <FormField label={t.customers.addresses.postalCode} optionalLabel={t.common.optional} error={msg(errors.postalCode?.message)}>
              <Input autoComplete="postal-code" {...form.register("postalCode")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <FormField label={t.customers.addresses.region} optionalLabel={t.common.optional} error={msg(errors.region?.message)}>
              <Input autoComplete="address-level1" {...form.register("region")} />
            </FormField>
            <FormField label={t.customers.addresses.country} error={msg(errors.countryCode?.message)}>
              <Input maxLength={2} autoComplete="country" className="uppercase" {...form.register("countryCode")} />
            </FormField>
          </div>
          <Controller
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="address-default" checked={field.value ?? false} onCheckedChange={(v) => field.onChange(v === true)} />
                <Label htmlFor="address-default">{t.customers.addresses.isDefault}</Label>
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

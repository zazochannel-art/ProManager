"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { saveCompanyDetailsAction } from "../../actions/organization-actions";
import { companyDetailsSchema, type CompanyDetailsInput } from "../../schemas/organization";

export function CompanyDetailsForm({
  defaults,
  submitLabel,
  onSaved,
  disabled = false,
}: {
  defaults: CompanyDetailsInput;
  submitLabel: string;
  onSaved: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const form = useForm<CompanyDetailsInput>({ resolver: zodResolver(companyDetailsSchema), defaultValues: defaults });
  const { submit, pending, formError } = useActionForm(form, saveCompanyDetailsAction, { onSuccess: onSaved });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const c = t.onboarding.company;
  const opt = t.common.optional;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <fieldset disabled={disabled} className="flex flex-col gap-4">
        <FormField label={t.onboarding.organization.name} error={msg(errors.name?.message)}>
          <Input {...form.register("name")} />
        </FormField>
        <FormField label={c.legalName} optionalLabel={opt} error={msg(errors.legalName?.message)}>
          <Input {...form.register("legalName")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={c.taxId} optionalLabel={opt} error={msg(errors.taxId?.message)}>
            <Input {...form.register("taxId")} />
          </FormField>
          <FormField label={c.registrationNumber} optionalLabel={opt} error={msg(errors.registrationNumber?.message)}>
            <Input {...form.register("registrationNumber")} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={c.email} optionalLabel={opt} error={msg(errors.email?.message)}>
            <Input type="email" inputMode="email" {...form.register("email")} />
          </FormField>
          <FormField label={c.phone} optionalLabel={opt} error={msg(errors.phone?.message)}>
            <Input type="tel" inputMode="tel" {...form.register("phone")} />
          </FormField>
        </div>
        <FormField label={c.addressLine1} optionalLabel={opt} error={msg(errors.addressLine1?.message)}>
          <Input autoComplete="street-address" {...form.register("addressLine1")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={c.city} optionalLabel={opt} error={msg(errors.city?.message)}>
            <Input {...form.register("city")} />
          </FormField>
          <FormField label={c.postalCode} optionalLabel={opt} error={msg(errors.postalCode?.message)}>
            <Input {...form.register("postalCode")} />
          </FormField>
        </div>
      </fieldset>
      {disabled ? null : (
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

export function CompanyStep({ defaults }: { defaults: CompanyDetailsInput }) {
  const { t } = useI18n();
  const router = useRouter();
  return <CompanyDetailsForm defaults={defaults} submitLabel={t.common.continue} onSaved={() => router.refresh()} />;
}

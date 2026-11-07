"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { COUNTRIES, CURRENCIES, LOCALES, TIMEZONES } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { LANGUAGE_NAMES } from "@/features/i18n/components/language-switcher";
import { saveRegionalSettingsAction } from "../../actions/organization-actions";
import { regionalSettingsSchema, type RegionalSettingsInput } from "../../schemas/organization";

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function RegionalSettingsForm({
  defaults,
  submitLabel,
  onSaved,
  disabled = false,
}: {
  defaults: RegionalSettingsInput;
  submitLabel: string;
  onSaved: () => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const form = useForm<RegionalSettingsInput>({ resolver: zodResolver(regionalSettingsSchema), defaultValues: defaults });
  const { submit, pending, formError } = useActionForm(form, saveRegionalSettingsAction, { onSuccess: onSaved });
  const errors = form.formState.errors;
  const r = t.onboarding.regional;

  function onCountryChange(code: string) {
    form.setValue("countryCode", code, { shouldDirty: true });
    const country = COUNTRIES.find((c) => c.code === code);
    if (country) {
      if (!form.getFieldState("currency").isDirty) form.setValue("currency", country.defaultCurrency);
      if (!form.getFieldState("timezone").isDirty) form.setValue("timezone", country.defaultTimezone);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={r.country} error={translateValidationMessage(t, errors.countryCode?.message)}>
          <Controller
            control={form.control}
            name="countryCode"
            render={({ field }) => (
              <Select value={field.value} onValueChange={onCountryChange} disabled={disabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {countryName(c.code, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField label={r.currency} error={translateValidationMessage(t, errors.currency?.message)}>
          <Controller
            control={form.control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
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
        <FormField label={r.language} error={translateValidationMessage(t, errors.locale?.message)}>
          <Controller
            control={form.control}
            name="locale"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LANGUAGE_NAMES[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField label={r.timezone} error={translateValidationMessage(t, errors.timezone?.message)}>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
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

export function RegionalStep({ defaults }: { defaults: RegionalSettingsInput }) {
  const { t } = useI18n();
  const router = useRouter();
  return <RegionalSettingsForm defaults={defaults} submitLabel={t.common.continue} onSaved={() => router.refresh()} />;
}

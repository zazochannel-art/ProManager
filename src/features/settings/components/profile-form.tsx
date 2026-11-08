"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { LOCALES, TIMEZONES } from "@/config/site";
import { LANGUAGE_NAMES } from "@/features/i18n/components/language-switcher";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { updateProfileAction } from "../actions/settings-actions";
import { profileSchema, type ProfileInput } from "../schemas/profile";

export function ProfileForm({ defaults, email }: { defaults: ProfileInput; email: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { submit, pending, formError } = useActionForm(form, updateProfileAction, {
    onSuccess: () => {
      toast.success(t.settings.profileSaved);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      <FormField label={t.auth.email}>
        <Input value={email} readOnly disabled />
      </FormField>
      <FormField label={t.profile.fullName} error={msg(errors.fullName?.message)}>
        <Input autoComplete="name" {...form.register("fullName")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.profile.language} error={msg(errors.locale?.message)}>
          <Controller
            control={form.control}
            name="locale"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
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
        <FormField label={t.profile.timezone} error={msg(errors.timezone?.message)}>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

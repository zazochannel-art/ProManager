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
import { createOrganizationAction } from "../../actions/organization-actions";
import { createOrganizationSchema, suggestSlug, type CreateOrganizationInput } from "../../schemas/organization";

export function OrganizationStep() {
  const { t } = useI18n();
  const router = useRouter();
  const form = useForm<CreateOrganizationInput>({ resolver: zodResolver(createOrganizationSchema), defaultValues: { name: "", slug: "" } });
  const { submit, pending, formError } = useActionForm(form, createOrganizationAction, {
    onSuccess: () => router.replace("/onboarding"),
  });
  const errors = form.formState.errors;
  const slugError = errors.slug?.message === "slugTaken" ? t.onboarding.organization.slugTaken : translateValidationMessage(t, errors.slug?.message);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && !["validation", "conflict"].includes(formError.error) ? (
        <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert>
      ) : null}
      <FormField label={t.onboarding.organization.name} error={translateValidationMessage(t, errors.name?.message)}>
        <Input
          autoComplete="organization"
          {...form.register("name", {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!form.getFieldState("slug").isDirty) form.setValue("slug", suggestSlug(e.target.value));
            },
          })}
        />
      </FormField>
      <FormField label={t.onboarding.organization.slug} hint={t.onboarding.organization.slugHelp} error={slugError}>
        <Input autoCapitalize="none" spellCheck={false} {...form.register("slug")} />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {t.common.continue}
        </Button>
      </div>
    </form>
  );
}

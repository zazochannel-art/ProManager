"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { updatePasswordAction } from "../actions/auth-actions";
import { resetPasswordSchema, type ResetPasswordInput } from "../schemas/auth";
import { authErrorMessage } from "../services/auth-errors";

export function ResetPasswordForm() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const form = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirmPassword: "" } });
  const { submit, pending, formError } = useActionForm(form, updatePasswordAction, { onSuccess: () => setDone(true) });
  const errors = form.formState.errors;

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">{t.auth.passwordUpdated}</FormAlert>
        <Link href="/dashboard" className={buttonVariants({ className: "w-full" })}>
          {t.errors.goToDashboard}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? (
        <FormAlert>{authErrorMessage(t, (formError as { authError?: string }).authError)}</FormAlert>
      ) : null}
      <FormField label={t.auth.newPassword} hint={t.auth.passwordHint} error={translateValidationMessage(t, errors.password?.message)}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField label={t.auth.confirmPassword} error={translateValidationMessage(t, errors.confirmPassword?.message)}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <Button type="submit" loading={pending} className="w-full">
        {t.auth.updatePassword}
      </Button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { requestPasswordResetAction } from "../actions/auth-actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas/auth";
import { authErrorMessage } from "../services/auth-errors";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const { submit, pending, formError } = useActionForm(form, requestPasswordResetAction, { onSuccess: () => setSent(true) });

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">{t.auth.resetSent}</FormAlert>
        <Link href="/login" className="text-center text-sm font-medium text-primary hover:underline">
          {t.auth.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError && !formError.ok && formError.error !== "validation" ? (
        <FormAlert>{authErrorMessage(t, (formError as { authError?: string }).authError)}</FormAlert>
      ) : null}
      <FormField label={t.auth.email} error={translateValidationMessage(t, form.formState.errors.email?.message)}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>
      <Button type="submit" loading={pending} className="w-full">
        {t.auth.sendResetLink}
      </Button>
      <Link href="/login" className="text-center text-sm font-medium text-primary hover:underline">
        {t.auth.backToLogin}
      </Link>
    </form>
  );
}

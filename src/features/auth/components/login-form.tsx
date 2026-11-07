"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { signInAction } from "../actions/auth-actions";
import { loginSchema, type LoginInput } from "../schemas/auth";
import { authErrorMessage } from "../services/auth-errors";

export function LoginForm({ nextPath, initialError }: { nextPath?: string; initialError?: string }) {
  const { t } = useI18n();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { submit, pending, formError } = useActionForm(form, (values) => signInAction(values, nextPath));
  const errors = form.formState.errors;
  const errorCode = formError && !formError.ok ? ((formError as { authError?: string }).authError ?? formError.error) : initialError;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errorCode ? <FormAlert>{authErrorMessage(t, errorCode)}</FormAlert> : null}
      <FormField label={t.auth.email} error={translateValidationMessage(t, errors.email?.message)}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>
      <FormField label={t.auth.password} error={translateValidationMessage(t, errors.password?.message)}>
        <Input type="password" autoComplete="current-password" {...form.register("password")} />
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          {t.auth.forgotPassword}
        </Link>
      </div>
      <Button type="submit" loading={pending} className="w-full">
        {pending ? t.auth.signingIn : t.auth.signIn}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.auth.noAccount}{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t.auth.createAccount}
        </Link>
      </p>
    </form>
  );
}

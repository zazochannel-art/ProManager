"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { signUpAction } from "../actions/auth-actions";
import { registerSchema, type RegisterInput } from "../schemas/auth";
import { authErrorMessage } from "../services/auth-errors";

export function RegisterForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", locale },
  });
  const { submit, pending, formError } = useActionForm(form, signUpAction, {
    onSuccess: ({ email }) => router.push(`/verify-email?email=${encodeURIComponent(email)}`),
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const authError = formError && !formError.ok ? (formError as { authError?: string }).authError : undefined;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {authError ? <FormAlert>{authErrorMessage(t, authError)}</FormAlert> : null}
      <FormField label={t.auth.fullName} error={msg(errors.fullName?.message)}>
        <Input autoComplete="name" {...form.register("fullName")} />
      </FormField>
      <FormField label={t.auth.email} error={msg(errors.email?.message)}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>
      <FormField label={t.auth.password} hint={t.auth.passwordHint} error={msg(errors.password?.message)}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField label={t.auth.confirmPassword} error={msg(errors.confirmPassword?.message)}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <Button type="submit" loading={pending} className="w-full">
        {pending ? t.auth.creatingAccount : t.auth.createAccount}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.auth.haveAccount}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </form>
  );
}

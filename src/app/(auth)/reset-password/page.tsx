import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { FormAlert } from "@/components/forms/form-field";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { getAuthUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Reset password" };

/** Reached through the recovery e-mail → /auth/confirm, which establishes a session. */
export default async function ResetPasswordPage() {
  const { t } = await getI18n();
  const user = await getAuthUser();
  return (
    <AuthCard title={t.auth.resetTitle}>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="flex flex-col gap-4">
          <FormAlert>{t.auth.errors.linkInvalid}</FormAlert>
          <Link href="/forgot-password" className="text-center text-sm font-medium text-primary hover:underline">
            {t.auth.sendResetLink}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}

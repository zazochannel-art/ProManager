import type { Metadata } from "next";
import { AuthCard } from "@/components/layout/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <AuthCard title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}

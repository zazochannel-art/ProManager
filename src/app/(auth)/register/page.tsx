import type { Metadata } from "next";
import { AuthCard } from "@/components/layout/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  const { t } = await getI18n();
  return (
    <AuthCard title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      <RegisterForm />
    </AuthCard>
  );
}

import type { Metadata } from "next";
import { AuthCard } from "@/components/layout/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getI18n } from "@/lib/i18n/server";
import { safeRedirectPath } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { t } = await getI18n();
  const params = await searchParams;
  // Where to continue after the e-mail is confirmed (e.g. back to an invitation).
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  return (
    <AuthCard title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      <RegisterForm nextPath={next} />
    </AuthCard>
  );
}

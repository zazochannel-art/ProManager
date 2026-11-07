import type { Metadata } from "next";
import { AuthCard } from "@/components/layout/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getI18n } from "@/lib/i18n/server";
import { safeRedirectPath } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Login" };

const KNOWN_ERRORS = new Set(["link_invalid", "email_not_confirmed"]);

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { t } = await getI18n();
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  const error = typeof params.error === "string" && KNOWN_ERRORS.has(params.error) ? params.error : undefined;
  return (
    <AuthCard title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <LoginForm nextPath={next} initialError={error} />
    </AuthCard>
  );
}

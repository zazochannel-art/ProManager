import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthCard } from "@/components/layout/auth-card";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { emailField } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Verify e-mail" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { t } = await getI18n();
  const params = await searchParams;
  const parsed = emailField.safeParse(params.email);
  return (
    <AuthCard title={t.auth.verifyTitle}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          {parsed.success ? interpolate(t.auth.verifyBody, { email: parsed.data }) : t.auth.verifyBodyGeneric}
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          {t.auth.backToLogin}
        </Link>
      </div>
    </AuthCard>
  );
}

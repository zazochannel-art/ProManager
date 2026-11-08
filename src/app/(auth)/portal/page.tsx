import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Client portal", robots: { index: false } };

/** Honest placeholder: portal access tables and RLS exist, the customer-facing screens come later. */
export default async function PortalPage() {
  const { t } = await getI18n();
  return (
    <AuthCard title={t.portal.title}>
      <p className="text-sm text-muted-foreground">{t.portal.body}</p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
        {t.errors.goHome}
      </Link>
    </AuthCard>
  );
}

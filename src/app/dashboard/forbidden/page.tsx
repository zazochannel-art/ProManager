import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Access denied" };

export default async function ForbiddenPage() {
  const { t } = await getI18n();
  return (
    <EmptyState
      icon={ShieldAlert}
      title={t.errors.forbiddenTitle}
      description={t.errors.forbiddenBody}
      action={
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t.errors.goToDashboard}</Link>
        </Button>
      }
    />
  );
}

"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useI18n } from "@/lib/i18n/client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    // Server errors are logged server-side; only the opaque digest reaches the browser.
    console.error("dashboard_error", error.digest ?? error.message);
  }, [error]);
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t.errors.unexpectedTitle}
      description={t.errors.unexpectedBody}
      action={<Button onClick={reset}>{t.common.retry}</Button>}
    />
  );
}

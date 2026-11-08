"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useI18n } from "@/lib/i18n/client";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("route_error", error.digest ?? error.message);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <EmptyState
        className="w-full bg-surface"
        icon={AlertTriangle}
        title={t.errors.unexpectedTitle}
        description={t.errors.unexpectedBody}
        action={<Button onClick={reset}>{t.common.retry}</Button>}
      />
    </main>
  );
}

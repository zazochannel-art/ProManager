import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <EmptyState
        className="w-full bg-surface"
        icon={FileQuestion}
        title={t.errors.notFoundTitle}
        description={t.errors.notFoundBody}
        action={
          <Button asChild variant="secondary">
            <Link href="/">{t.errors.goHome}</Link>
          </Button>
        }
      />
    </main>
  );
}

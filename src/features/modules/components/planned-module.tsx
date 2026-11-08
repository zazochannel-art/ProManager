import Link from "next/link";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { navItemByKey, type NavKey } from "@/config/navigation";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";

/**
 * Honest placeholder for modules whose database layer exists but whose
 * screens are scheduled for a later phase. It is permission-guarded exactly
 * like the real page will be, and it offers no fake actions.
 */
export async function PlannedModule({ moduleKey }: { moduleKey: NavKey }) {
  const item = navItemByKey(moduleKey);
  await requirePagePermission(item.permission);
  const { t } = await getI18n();
  const title = t.nav[moduleKey];
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Construction}
        title={interpolate(t.modules.plannedTitle, { module: title })}
        description={t.modules.plannedBody}
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard">{t.modules.backToDashboard}</Link>
          </Button>
        }
      />
    </>
  );
}

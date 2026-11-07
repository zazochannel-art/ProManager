import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { listNotifications } from "@/features/notifications/services/notification-service";
import { NotificationList } from "@/features/notifications/components/notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requirePagePermission("notifications.read");
  const { t } = await getI18n();
  const supabase = await createClient();
  const items = await listNotifications(supabase, ctx.organization.id, ctx.user.id, { limit: 100 });
  return (
    <>
      <PageHeader title={t.notifications.title} description={t.notifications.description} />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title={t.notifications.empty} description={t.notifications.emptyBody} />
      ) : (
        <NotificationList
          timeZone={ctx.settings.timezone}
          items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, linkPath: n.link_path, createdAt: n.created_at, read: n.read_at !== null }))}
        />
      )}
    </>
  );
}

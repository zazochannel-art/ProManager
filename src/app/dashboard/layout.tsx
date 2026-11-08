import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { visibleNavKeys } from "@/config/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { countUnreadNotifications, listNotifications } from "@/features/notifications/services/notification-service";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const ctx = await requireOrganizationContext();
  // Owners/admins finish the setup wizard first; other roles join an already configured workspace.
  if (ctx.settings.onboarding_step !== "completed" && ctx.can("settings.manage")) redirect("/onboarding");

  const { t } = await getI18n();
  const supabase = await createClient();
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(supabase, ctx.organization.id, ctx.user.id, { limit: 8 }),
    countUnreadNotifications(supabase, ctx.organization.id, ctx.user.id),
  ]);
  const navKeys = visibleNavKeys(ctx.role);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-md"
      >
        {t.shell.skipToContent}
      </a>
      <Sidebar navKeys={navKeys} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          navKeys={navKeys}
          organizations={ctx.memberships.map((m) => ({ id: m.organizationId, name: m.organizationName, roleLabel: t.roles[m.role] }))}
          activeOrganizationId={ctx.organization.id}
          notifications={notifications.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            linkPath: n.link_path,
            createdAt: n.created_at,
            read: n.read_at !== null,
          }))}
          unreadCount={unreadCount}
          timeZone={ctx.settings.timezone}
          user={{ name: ctx.profile.full_name ?? "", email: ctx.profile.email ?? ctx.user.email ?? "", roleLabel: t.roles[ctx.role] }}
        />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

import type { NavKey } from "@/config/navigation";
import { LanguageSwitcher } from "@/features/i18n/components/language-switcher";
import { GlobalSearch } from "./global-search";
import { MobileNav } from "./mobile-nav";
import { NotificationCenter, type NotificationPreview } from "./notification-center";
import { OrganizationSwitcher, type OrganizationOption } from "./organization-switcher";
import { UserMenu } from "./user-menu";

export function Topbar({
  navKeys,
  organizations,
  activeOrganizationId,
  notifications,
  unreadCount,
  timeZone,
  user,
}: {
  navKeys: NavKey[];
  organizations: OrganizationOption[];
  activeOrganizationId: string;
  notifications: NotificationPreview[];
  unreadCount: number;
  timeZone: string;
  user: { name: string; email: string; roleLabel: string };
}) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur sm:px-6">
      <MobileNav navKeys={navKeys} />
      <OrganizationSwitcher organizations={organizations} activeId={activeOrganizationId} />
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <GlobalSearch />
        <LanguageSwitcher compact />
        <NotificationCenter items={notifications} unreadCount={unreadCount} timeZone={timeZone} />
        <UserMenu {...user} />
      </div>
    </header>
  );
}

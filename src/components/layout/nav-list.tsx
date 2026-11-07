"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUP_ORDER, NAV_ITEMS, activeNavKey, type NavKey } from "@/config/navigation";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

export function NavList({ keys, onNavigate }: { keys: NavKey[]; onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const active = activeNavKey(pathname, keys);

  return (
    <nav aria-label={t.shell.mainNavigation} className="flex flex-col gap-5">
      {NAV_GROUP_ORDER.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group && keys.includes(item.key));
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.nav.groups[group]}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === active;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                        isActive ? "bg-primary-soft text-primary-hover" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                      <span className="truncate">{t.nav[item.key]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/features/notifications/actions/notification-actions";

export interface NotificationPreview {
  id: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  createdAt: string;
  read: boolean;
}

export function NotificationCenter({ items, unreadCount, timeZone }: { items: NotificationPreview[]; unreadCount: number; timeZone: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(t.common.genericError);
      router.refresh();
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t.shell.notifications}${unreadCount ? ` (${unreadCount})` : ""}`}>
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t.shell.notifications}</p>
          {unreadCount > 0 ? (
            <Button variant="link" size="sm" disabled={pending} onClick={() => run(markAllNotificationsReadAction)}>
              {t.shell.markAllRead}
            </Button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.shell.noNotifications}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.read && "bg-primary-soft/40")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {n.linkPath ? (
                    <Link href={n.linkPath} className="block truncate text-sm font-medium hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">{n.title}</p>
                  )}
                  {n.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt, locale, timeZone)}</p>
                </div>
                {!n.read ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => markNotificationReadAction(n.id))}>
                    {t.notifications.markRead}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border px-4 py-2 text-center">
          <Link href="/dashboard/notifications" className="text-sm font-medium text-primary hover:underline">
            {t.common.viewAll}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { NotificationPreview } from "@/components/layout/notification-center";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { markAllNotificationsReadAction, markNotificationReadAction } from "../actions/notification-actions";

export function NotificationList({ items, timeZone }: { items: NotificationPreview[]; timeZone: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hasUnread = items.some((n) => !n.read);

  function run(action: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(t.common.genericError);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface shadow-xs">
      {hasUnread ? (
        <div className="flex justify-end border-b border-border px-4 py-2">
          <Button variant="link" size="sm" disabled={pending} onClick={() => run(markAllNotificationsReadAction)}>
            {t.shell.markAllRead}
          </Button>
        </div>
      ) : null}
      <ul className="divide-y divide-border">
        {items.map((n) => (
          <li key={n.id} className={cn("flex gap-3 px-4 py-4", !n.read && "bg-primary-soft/40")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {n.linkPath ? (
                <Link href={n.linkPath} className="text-sm font-medium hover:underline">
                  {n.title}
                </Link>
              ) : (
                <p className="text-sm font-medium">{n.title}</p>
              )}
              {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
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
    </div>
  );
}

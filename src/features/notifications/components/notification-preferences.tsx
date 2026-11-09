"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/permissions/matrix";
import { channelEnabled, EVENT_AUDIENCE, NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, type NotificationChannel, type NotificationEvent, type PreferenceRow } from "../schemas/events";
import { setNotificationPreferenceAction } from "../actions/notification-actions";

/** Events this role can receive: named-recipient events always, role events only for the audience. */
export function eventsForRole(role: Role): NotificationEvent[] {
  return NOTIFICATION_EVENTS.filter((e) => {
    if (e === "portal.opened") return can(role, "portal.manage");
    const audience = EVENT_AUDIENCE[e];
    return audience === null || audience.includes(role);
  });
}

export function NotificationPreferences({ role, rows, emailConfigured }: { role: Role; rows: PreferenceRow[]; emailConfigured: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState(rows);
  const [pending, startTransition] = useTransition();
  const label = { in_app: t.notifications.inApp, email: t.notifications.email } satisfies Record<NotificationChannel, string>;

  function toggle(event: NotificationEvent, channel: NotificationChannel, enabled: boolean) {
    const previous = state;
    setState([...state.filter((r) => !(r.event_type === event && r.channel === channel)), { event_type: event, channel, enabled }]);
    startTransition(async () => {
      const result = await setNotificationPreferenceAction(event, channel, enabled);
      if (!result.ok) {
        setState(previous);
        toast.error(actionErrorMessage(t, result.error));
      } else toast.success(t.notifications.saved);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {!emailConfigured ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t.notifications.emailNotConfigured}</p> : null}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:gap-x-8">
          <span>{t.notifications.event}</span>
          {NOTIFICATION_CHANNELS.map((c) => (
            <span key={c} className="w-16 text-center sm:w-24">
              {label[c]}
            </span>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {eventsForRole(role).map((event) => {
            const text = t.notifications.events[event];
            return (
              <li key={event} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3 sm:gap-x-8">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{text.label}</p>
                  <p className="text-xs text-muted-foreground">{text.hint}</p>
                </div>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <span key={channel} className="flex w-16 justify-center sm:w-24">
                    <Checkbox
                      aria-label={`${text.label}: ${label[channel]}`}
                      checked={channelEnabled(state, event, channel)}
                      disabled={pending}
                      onCheckedChange={(v) => toggle(event, channel, v === true)}
                    />
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{t.notifications.forRoles}</p>
    </div>
  );
}

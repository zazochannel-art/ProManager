import type { Role } from "@/lib/permissions/matrix";

/** Events a member can be told about. The order is the order of the settings list. */
export const NOTIFICATION_EVENTS = ["task.assigned", "payment.recorded", "stock.low", "portal.opened", "member.joined"] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Who hears about an event. Events sent to named people (task.assigned, portal.opened) have no role audience. */
export const EVENT_AUDIENCE: Record<NotificationEvent, readonly Role[] | null> = {
  "task.assigned": null,
  "payment.recorded": ["owner", "admin", "accountant"],
  "stock.low": ["owner", "admin", "manager"],
  "portal.opened": null,
  "member.joined": ["owner", "admin"],
};

/** Without a saved choice, in-app is on and e-mail is off. */
export const DEFAULT_CHANNEL_ENABLED: Record<NotificationChannel, boolean> = { in_app: true, email: false };

export function isNotificationEvent(v: unknown): v is NotificationEvent {
  return typeof v === "string" && (NOTIFICATION_EVENTS as readonly string[]).includes(v);
}

export function isNotificationChannel(v: unknown): v is NotificationChannel {
  return typeof v === "string" && (NOTIFICATION_CHANNELS as readonly string[]).includes(v);
}

export type PreferenceRow = { event_type: string; channel: string; enabled: boolean };

/** Whether a member gets an event on a channel, given their saved rows. */
export function channelEnabled(rows: readonly PreferenceRow[], event: NotificationEvent, channel: NotificationChannel): boolean {
  const row = rows.find((r) => r.event_type === event && r.channel === channel);
  return row ? row.enabled : DEFAULT_CHANNEL_ENABLED[channel];
}

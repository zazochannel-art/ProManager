import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/config/env";
import { isLocale, type Locale } from "@/config/site";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import { escapeHtml, sendEmail } from "@/lib/email/send";
import { logger } from "@/lib/security/logger";
import { channelEnabled, EVENT_AUDIENCE, type NotificationEvent } from "../schemas/events";

type Admin = ReturnType<typeof createAdminClient>;

export interface NotificationMessage {
  title: string;
  body?: string | null;
}

export interface NotifyInput {
  organizationId: string;
  event: NotificationEvent;
  /** Who caused the event; never told about their own action. */
  actorId?: string | null;
  /** Named recipients. Without them, the event's role audience is used. */
  userIds?: string[];
  /** In-app path the notification opens, e.g. /dashboard/invoices/<id>. */
  link: string;
  /** Builds the text in each recipient's language. */
  message: (t: Dictionary, locale: Locale) => NotificationMessage;
  /** false when a database trigger already writes the in-app row (task.assigned). */
  inApp?: boolean;
}

export interface NotifyResult {
  inApp: number;
  emailed: number;
}

/**
 * Tells the right members about an event, in-app and by e-mail, following each
 * member's saved choices. Uses the admin client because members may not write
 * notifications for each other; every query is filtered by the organization.
 * Never throws: a notification must not undo the work that caused it.
 */
export async function notify(input: NotifyInput, adminClient?: Admin): Promise<NotifyResult> {
  const none = { inApp: 0, emailed: 0 };
  let admin: Admin;
  try {
    admin = adminClient ?? createAdminClient();
  } catch {
    logger.warn("notify.unavailable", { event: input.event, reason: "SUPABASE_SECRET_KEY missing" });
    return none;
  }
  try {
    return await deliver(admin, input);
  } catch (error) {
    logger.error("notify.failed", { event: input.event, organizationId: input.organizationId, error: error instanceof Error ? error.message : String(error) });
    return none;
  }
}

async function deliver(admin: Admin, input: NotifyInput): Promise<NotifyResult> {
  const audience = EVENT_AUDIENCE[input.event];
  let members = admin.from("organization_members").select("user_id, role").eq("organization_id", input.organizationId).eq("status", "active");
  if (input.userIds) {
    if (input.userIds.length === 0) return { inApp: 0, emailed: 0 };
    members = members.in("user_id", input.userIds);
  } else if (audience) {
    members = members.in("role", [...audience]);
  } else {
    return { inApp: 0, emailed: 0 };
  }
  const { data: memberRows, error: membersError } = await members;
  if (membersError) throw new Error(membersError.message);
  const ids = [...new Set((memberRows ?? []).map((m) => m.user_id))].filter((id) => id !== input.actorId);
  if (ids.length === 0) return { inApp: 0, emailed: 0 };

  const [profiles, prefs, organization] = await Promise.all([
    admin.from("profiles").select("id, email, locale").in("id", ids),
    admin.from("notification_preferences").select("user_id, event_type, channel, enabled").eq("organization_id", input.organizationId).eq("event_type", input.event).in("user_id", ids),
    admin.from("organizations").select("name").eq("id", input.organizationId).maybeSingle(),
  ]);
  for (const r of [profiles, prefs, organization]) if (r.error) throw new Error(r.error.message);

  const rows: { organization_id: string; user_id: string; type: string; title: string; body: string | null; link_path: string }[] = [];
  const mails: Promise<{ sent: boolean }>[] = [];
  for (const profile of profiles.data ?? []) {
    const own = (prefs.data ?? []).filter((p) => p.user_id === profile.id);
    const locale: Locale = isLocale(profile.locale) ? profile.locale : "ro";
    const t = getDictionary(locale);
    const message = input.message(t, locale);
    const title = message.title.slice(0, 200);
    const body = message.body ? message.body.slice(0, 2000) : null;
    if (input.inApp !== false && channelEnabled(own, input.event, "in_app")) {
      rows.push({ organization_id: input.organizationId, user_id: profile.id, type: input.event, title, body, link_path: input.link });
    }
    if (profile.email && channelEnabled(own, input.event, "email")) {
      const url = `${getPublicEnv().NEXT_PUBLIC_APP_URL}${input.link}`;
      const footer = t.notifications.mail.footer.replace("{organization}", organization.data?.name ?? "ProManager");
      mails.push(
        sendEmail({
          to: profile.email,
          subject: title,
          text: [title, body, url, footer].filter(Boolean).join("\n\n"),
          html: `<p><strong>${escapeHtml(title)}</strong></p>${body ? `<p>${escapeHtml(body)}</p>` : ""}<p><a href="${escapeHtml(url)}">${escapeHtml(t.notifications.mail.open)}</a></p><p style="color:#64748b;font-size:12px">${escapeHtml(footer)}</p>`,
        }),
      );
    }
  }
  if (rows.length > 0) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) throw new Error(error.message);
  }
  const sent = await Promise.all(mails);
  return { inApp: rows.length, emailed: sent.filter((s) => s.sent).length };
}

/** Sends after the response, so the person who acted never waits on e-mail. */
export function notifyLater(input: NotifyInput): void {
  try {
    after(() => notify(input));
  } catch {
    // Outside a request (scripts, tests) there is no "after": send now, without waiting.
    void notify(input);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { uuidField } from "@/lib/validation/common";
import { fail, mapDatabaseError, ok, type ActionResult } from "@/lib/validation/action-result";
import { isNotificationChannel, isNotificationEvent } from "../schemas/events";

export async function markNotificationReadAction(notificationId: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail("unauthenticated");
  const id = uuidField.safeParse(notificationId);
  if (!id.success) return fail("validation");
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("organization_id", ctx.organization.id)
    .eq("user_id", ctx.user.id);
  if (error) return fail(mapDatabaseError(error));
  revalidatePath("/dashboard", "layout");
  return ok(undefined);
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail("unauthenticated");
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", ctx.organization.id)
    .eq("user_id", ctx.user.id)
    .is("read_at", null);
  if (error) return fail(mapDatabaseError(error));
  revalidatePath("/dashboard", "layout");
  return ok(undefined);
}

/** Saves one of the member's own notification choices (RLS: own rows only). */
export async function setNotificationPreferenceAction(event: unknown, channel: unknown, enabled: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail("unauthenticated");
  if (!isNotificationEvent(event) || !isNotificationChannel(channel) || typeof enabled !== "boolean") return fail("validation");
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { organization_id: ctx.organization.id, user_id: ctx.user.id, event_type: event, channel, enabled },
      { onConflict: "organization_id,user_id,channel,event_type" },
    );
  if (error) return fail(mapDatabaseError(error));
  revalidatePath("/dashboard/settings");
  return ok(undefined);
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { uuidField } from "@/lib/validation/common";
import { zonedTimeToUtc } from "@/lib/utils/dates";
import { eventCreateSchema } from "../schemas/event";

export async function createEventAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getActionContext("calendar.write");
    if (!ctx) return fail("unauthenticated");
    const parsed = eventCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const tz = ctx.settings.timezone;
    const supabase = await createClient();
    // Composite FKs reject a project or customer from another organization.
    const { data, error } = await supabase
      .from("events")
      .insert({
        organization_id: ctx.organization.id,
        title: v.title,
        all_day: v.allDay,
        // All-day events are stored at 12:00 UTC so the calendar day never shifts in MD/RO/EU time zones.
        starts_at: v.allDay ? `${v.startDate}T12:00:00Z` : zonedTimeToUtc(v.startDate, v.startTime, tz),
        ends_at: v.allDay ? `${v.endDate}T12:00:00Z` : zonedTimeToUtc(v.endDate, v.endTime, tz),
        location: v.location ?? null,
        description: v.description ?? null,
        project_id: v.projectId ?? null,
        customer_id: v.customerId ?? null,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard/calendar");
    return ok({ id: data.id });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

export async function deleteEventAction(eventId: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getActionContext("calendar.write");
    if (!ctx) return fail("unauthenticated");
    const id = uuidField.safeParse(eventId);
    if (!id.success) return fail("not_found");
    const supabase = await createClient();
    const { data, error } = await supabase.from("events").delete().eq("organization_id", ctx.organization.id).eq("id", id.data).select("id").single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard/calendar");
    return ok({ id: data.id });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

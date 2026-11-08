import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { addDays, partsInTimeZone } from "@/lib/utils/dates";

export interface CalendarItem {
  kind: "event" | "task";
  id: string;
  title: string;
  /** Local start time (HH:mm), absent for all-day events and tasks. */
  time?: string;
  endTime?: string;
  allDay: boolean;
  location?: string | null;
  description?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  customerName?: string | null;
  status?: string;
  /** Local first and last day (yyyy-mm-dd) the item covers. */
  startDate: string;
  endDate: string;
}

/** Monday-first grid of whole weeks covering a month (yyyy-mm). */
export function monthGrid(month: string): { first: string; last: string; days: string[] } {
  const start = `${month}-01`;
  const weekday = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const first = addDays(start, -weekday);
  const next = new Date(`${start}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const monthEnd = addDays(next.toISOString().slice(0, 10), -1);
  const tail = 6 - ((new Date(`${monthEnd}T12:00:00Z`).getUTCDay() + 6) % 7);
  const last = addDays(monthEnd, tail);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return { first, last, days };
}

/**
 * Events and task deadlines between two local dates (inclusive), under the
 * caller's RLS. All-day events and task deadlines are stored at 12:00 UTC and
 * read by their UTC date; timed events are converted to the organization's zone.
 */
export async function listCalendarItems(
  supabase: ServerSupabaseClient,
  organizationId: string,
  range: { first: string; last: string },
  timeZone: string,
  options: { includeTasks: boolean },
): Promise<CalendarItem[]> {
  // One extra day on each side covers every UTC offset used in MD/RO/EU.
  const from = `${addDays(range.first, -1)}T00:00:00Z`;
  const to = `${addDays(range.last, 2)}T00:00:00Z`;
  const [events, tasks] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, description, location, starts_at, ends_at, all_day, project_id, projects(name), customers(name)")
      .eq("organization_id", organizationId)
      .lt("starts_at", to)
      .gte("ends_at", from)
      .order("starts_at")
      .limit(1000),
    options.includeTasks
      ? supabase
          .from("tasks")
          .select("id, title, status, due_at, project_id, projects(name)")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .gte("due_at", from)
          .lt("due_at", to)
          .order("due_at")
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (events.error) throw new Error(`Failed to list events: ${events.error.message}`);
  if (tasks.error) throw new Error(`Failed to list task deadlines: ${tasks.error.message}`);

  const items: CalendarItem[] = [];
  for (const raw of events.data ?? []) {
    const e = raw as typeof raw & { projects: { name: string } | null; customers: { name: string } | null };
    const start = e.all_day ? { date: e.starts_at.slice(0, 10), time: "" } : partsInTimeZone(e.starts_at, timeZone);
    const end = e.all_day ? { date: e.ends_at.slice(0, 10), time: "" } : partsInTimeZone(e.ends_at, timeZone);
    if (end.date < range.first || start.date > range.last) continue;
    items.push({
      kind: "event",
      id: e.id,
      title: e.title,
      time: e.all_day ? undefined : start.time,
      endTime: e.all_day ? undefined : end.time,
      allDay: e.all_day,
      location: e.location,
      description: e.description,
      projectId: e.project_id,
      projectName: e.projects?.name ?? null,
      customerName: e.customers?.name ?? null,
      startDate: start.date,
      endDate: end.date,
    });
  }
  for (const raw of tasks.data ?? []) {
    const t = raw as typeof raw & { projects: { name: string } | null };
    if (!t.due_at) continue;
    const date = t.due_at.slice(0, 10);
    if (date < range.first || date > range.last) continue;
    items.push({
      kind: "task",
      id: t.id,
      title: t.title,
      allDay: true,
      status: t.status,
      projectId: t.project_id,
      projectName: t.projects?.name ?? null,
      startDate: date,
      endDate: date,
    });
  }
  return items;
}

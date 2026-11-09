import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { todayInTimeZone } from "@/lib/utils/dates";
import { INTL_LOCALE } from "@/config/site";
import { listCustomerOptions } from "@/features/customers/services/customer-service";
import { listProjectOptions } from "@/features/projects/services/project-service";
import { listCalendarItems, monthGrid } from "@/features/calendar/services/calendar-service";
import { CalendarView } from "@/features/calendar/components/calendar-view";
import { CreateEventDialog } from "@/features/calendar/components/create-event-dialog";

export const metadata: Metadata = { title: "Calendar" };

function shiftMonth(month: string, delta: number): string {
  const d = new Date(`${month}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: PageProps<"/dashboard/calendar">) {
  const ctx = await requirePagePermission("calendar.read");
  const { t, locale } = await getI18n();
  const today = todayInTimeZone(ctx.settings.timezone);
  const raw = (await searchParams).month;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : today.slice(0, 7);
  const grid = monthGrid(month);

  const supabase = await createClient();
  const canWrite = ctx.can("calendar.write");
  const [items, projects, customers] = await Promise.all([
    listCalendarItems(supabase, ctx.organization.id, grid, ctx.settings.timezone, { includeTasks: ctx.can("tasks.read") }),
    canWrite && ctx.can("projects.read") ? listProjectOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite && ctx.can("customers.read") ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
  ]);
  const title = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        description={t.calendar.description}
        actions={canWrite ? <CreateEventDialog today={today} projects={projects} customers={customers} /> : null}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold capitalize">{title}</h2>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="icon-sm" aria-label={t.calendar.previousMonth}>
            <Link href={`/dashboard/calendar?month=${shiftMonth(month, -1)}`}>
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/dashboard/calendar">{t.calendar.today}</Link>
          </Button>
          <Button asChild variant="secondary" size="icon-sm" aria-label={t.calendar.nextMonth}>
            <Link href={`/dashboard/calendar?month=${shiftMonth(month, 1)}`}>
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <CalendarView month={month} days={grid.days} today={today} items={items} canWrite={canWrite} />
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary-soft ring-1 ring-primary/30" aria-hidden="true" />
          {t.calendar.legendEvents}
        </span>
        {ctx.can("tasks.read") ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-warning-soft ring-1 ring-warning/30" aria-hidden="true" />
            {t.calendar.legendTasks}
          </span>
        ) : null}
      </div>
    </>
  );
}

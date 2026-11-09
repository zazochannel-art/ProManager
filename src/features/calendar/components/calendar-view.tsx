"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, CheckSquare, Clock, FolderKanban, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { INTL_LOCALE } from "@/config/site";
import { deleteEventAction } from "../actions/event-actions";
import type { CalendarItem } from "../services/calendar-service";

const MAX_PER_DAY = 3;

function itemsForDay(items: CalendarItem[], day: string) {
  return items
    .filter((i) => i.startDate <= day && i.endDate >= day)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.time ?? "").localeCompare(b.time ?? "") || a.kind.localeCompare(b.kind));
}

export function CalendarView({
  month,
  days,
  today,
  items,
  canWrite,
}: {
  /** yyyy-mm being shown. */
  month: string;
  days: string[];
  today: string;
  items: CalendarItem[];
  canWrite: boolean;
}) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const weekdayFormat = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "short", timeZone: "UTC" });
  const weekdays = days.slice(0, 7).map((d) => weekdayFormat.format(new Date(`${d}T12:00:00Z`)));
  const agendaDays = days.filter((d) => d.startsWith(month) && itemsForDay(items, d).length > 0);
  const longDay = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  const chip = (item: CalendarItem, compact: boolean) => (
    <button
      key={`${item.kind}-${item.id}`}
      type="button"
      onClick={() => setSelected(item)}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-xs font-medium transition-colors",
        item.kind === "task"
          ? item.status === "done"
            ? "bg-success-soft text-success line-through"
            : "bg-warning-soft text-warning hover:brightness-95"
          : "bg-primary-soft text-primary hover:brightness-95",
        !compact && "py-1.5 text-sm",
      )}
    >
      {item.kind === "task" ? <CheckSquare className="size-3 shrink-0" aria-hidden="true" /> : null}
      {item.time ? <span className="shrink-0 tabular-nums opacity-80">{item.time}</span> : null}
      <span className="truncate">{item.title}</span>
    </button>
  );

  return (
    <>
      {/* Month grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm md:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {weekdays.map((w) => (
            <div key={w} className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const dayItems = itemsForDay(items, day);
            const inMonth = day.startsWith(month);
            return (
              <div
                key={day}
                className={cn("min-h-28 border-border p-1.5", index % 7 !== 6 && "border-r", index < days.length - 7 && "border-b", !inMonth && "bg-muted/30")}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      day === today ? "bg-brand font-semibold text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {dayItems.slice(0, MAX_PER_DAY).map((item) => chip(item, true))}
                  {dayItems.length > MAX_PER_DAY ? (
                    <p className="px-1.5 text-xs text-muted-foreground">+{dayItems.length - MAX_PER_DAY}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda (phones) */}
      <div className="md:hidden">
        {agendaDays.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{t.calendar.emptyMonth}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {agendaDays.map((day) => (
              <li key={day} className="rounded-xl border border-border/80 bg-surface p-3 shadow-sm">
                <p className={cn("mb-2 text-sm font-semibold capitalize", day === today && "text-primary")}>{longDay.format(new Date(`${day}T12:00:00Z`))}</p>
                <div className="flex flex-col gap-1.5">{itemsForDay(items, day).map((item) => chip(item, false))}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ItemDialog item={selected} onClose={() => setSelected(null)} canWrite={canWrite} />
    </>
  );
}

function ItemDialog({ item, onClose, canWrite }: { item: CalendarItem | null; onClose: () => void; canWrite: boolean }) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const when = item
    ? item.allDay
      ? item.startDate === item.endDate
        ? formatDate(item.startDate, locale)
        : `${formatDate(item.startDate, locale)} – ${formatDate(item.endDate, locale)}`
      : item.startDate === item.endDate
        ? `${formatDate(item.startDate, locale)}, ${item.time} – ${item.endTime}`
        : `${formatDate(item.startDate, locale)} ${item.time} – ${formatDate(item.endDate, locale)} ${item.endTime}`
    : "";
  return (
    <Dialog open={item !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={t.common.close}>
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>{item.title}</DialogTitle>
              <DialogDescription>{item.kind === "task" ? t.calendar.taskDeadline : item.allDay ? t.calendar.allDay : t.calendar.event}</DialogDescription>
            </DialogHeader>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                <dt className="sr-only">{t.calendar.when}</dt>
                <dd>{when}</dd>
              </div>
              {item.location ? (
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">{t.calendar.location}</dt>
                  <dd>{item.location}</dd>
                </div>
              ) : null}
              {item.projectId && item.projectName ? (
                <div className="flex items-center gap-2">
                  <FolderKanban className="size-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">{t.calendar.project}</dt>
                  <dd>
                    <Link className="text-primary hover:underline" href={`/dashboard/projects/${item.projectId}`}>
                      {item.projectName}
                    </Link>
                  </dd>
                </div>
              ) : null}
              {item.customerName ? (
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">{t.calendar.customer}</dt>
                  <dd>{item.customerName}</dd>
                </div>
              ) : null}
            </dl>
            {item.description ? <p className="whitespace-pre-line text-sm text-muted-foreground">{item.description}</p> : null}
            <div className="flex justify-end gap-2">
              {item.kind === "task" ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={item.projectId ? `/dashboard/projects/${item.projectId}` : "/dashboard/tasks"}>{t.calendar.openTask}</Link>
                </Button>
              ) : canWrite ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="secondary" size="sm">
                      <Trash2 aria-hidden="true" />
                      {t.common.delete}
                    </Button>
                  }
                  title={t.calendar.deleteTitle}
                  description={t.calendar.deleteBody}
                  confirmLabel={t.common.delete}
                  cancelLabel={t.common.cancel}
                  onConfirm={async () => {
                    if (await run(() => deleteEventAction(item.id), t.calendar.deleted)) onClose();
                  }}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

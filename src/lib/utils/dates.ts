import { INTL_LOCALE, type Locale } from "@/config/site";

/** Formats a date-only value (yyyy-mm-dd) without timezone shifting. */
export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : undefined,
  }).format(date);
}

/** Formats a timestamp in the organization's timezone. */
export function formatDateTime(value: string | null | undefined, locale: Locale, timeZone: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatMonth(yyyyMm: string, locale: Locale): string {
  const date = new Date(`${yyyyMm}-15T12:00:00Z`);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "short", timeZone: "UTC" }).format(date);
}

/** Today's date (yyyy-mm-dd) in a given IANA timezone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function timeZoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(instant / 1000) * 1000;
}

/**
 * Converts a wall-clock date and time in an IANA time zone to a UTC ISO
 * string (e.g. "2026-11-08", "09:30", "Europe/Chisinau" → "2026-11-08T07:30:00.000Z").
 * DST-safe: the offset is re-evaluated at the resulting instant.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let instant = wall - timeZoneOffset(wall, timeZone);
  instant = wall - timeZoneOffset(instant, timeZone);
  return new Date(instant).toISOString();
}

/** Local calendar date (yyyy-mm-dd) and time (HH:mm) of an instant in a time zone. */
export function partsInTimeZone(value: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Adds whole days to a yyyy-mm-dd date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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

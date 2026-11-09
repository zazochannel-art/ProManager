import type { Locale } from "@/config/site";
import { formatMoney } from "./format";

/**
 * Per-currency totals as one line, the organization currency first:
 * "1 200,00 MDL · 300,00 EUR". Null when every amount is zero.
 */
export function formatAmountsByCurrency(byCurrency: Record<string, string>, first: string, locale: Locale): string | null {
  const entries = Object.entries(byCurrency).filter(([, v]) => Number(v) !== 0);
  if (entries.length === 0) return null;
  entries.sort(([a], [b]) => (a === first ? -1 : b === first ? 1 : a.localeCompare(b)));
  return entries.map(([c, v]) => formatMoney(v, c, locale)).join(" · ");
}

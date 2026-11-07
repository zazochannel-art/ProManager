import { INTL_LOCALE, type Locale } from "@/config/site";
import { toFixed, type DecimalInput } from "@/lib/calculations/decimal";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats a monetary amount for display. The amount is passed to Intl as an
 * exact decimal string (never converted through floating point).
 */
export function formatMoney(amount: DecimalInput, currency: string, locale: Locale): string {
  const key = `${locale}:${currency}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter.format(toFixed(amount, 2) as `${number}`);
}

export function formatNumber(value: DecimalInput, locale: Locale, fractionDigits = 2): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toFixed(value, fractionDigits) as `${number}`);
}

export function formatPercent(value: DecimalInput, locale: Locale): string {
  return `${formatNumber(value, locale, 1)} %`;
}

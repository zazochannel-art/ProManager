export const siteConfig = {
  name: "ProManager",
  tagline: "Run your business. Not your paperwork.",
} as const;

export const LOCALES = ["ro", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ro";
export const LOCALE_COOKIE = "pm_locale";
export const ACTIVE_ORG_COOKIE = "pm_org";

/** BCP-47 tags used for Intl number/date formatting per UI locale. */
export const INTL_LOCALE: Record<Locale, string> = {
  ro: "ro-RO",
  ru: "ru-RU",
  en: "en-GB",
};

export const CURRENCIES = ["MDL", "RON", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const COUNTRIES = [
  { code: "MD", defaultCurrency: "MDL", defaultTimezone: "Europe/Chisinau", defaultLocale: "ro" },
  { code: "RO", defaultCurrency: "RON", defaultTimezone: "Europe/Bucharest", defaultLocale: "ro" },
  { code: "DE", defaultCurrency: "EUR", defaultTimezone: "Europe/Berlin", defaultLocale: "en" },
  { code: "IT", defaultCurrency: "EUR", defaultTimezone: "Europe/Rome", defaultLocale: "en" },
  { code: "FR", defaultCurrency: "EUR", defaultTimezone: "Europe/Paris", defaultLocale: "en" },
  { code: "ES", defaultCurrency: "EUR", defaultTimezone: "Europe/Madrid", defaultLocale: "en" },
  { code: "GB", defaultCurrency: "EUR", defaultTimezone: "Europe/London", defaultLocale: "en" },
  { code: "UA", defaultCurrency: "EUR", defaultTimezone: "Europe/Kyiv", defaultLocale: "ru" },
] as const satisfies ReadonlyArray<{
  code: string;
  defaultCurrency: CurrencyCode;
  defaultTimezone: string;
  defaultLocale: Locale;
}>;
export type CountryCode = (typeof COUNTRIES)[number]["code"];

export const TIMEZONES = [
  "Europe/Chisinau",
  "Europe/Bucharest",
  "Europe/Kyiv",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
] as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export type Timezone = (typeof TIMEZONES)[number];

/** Narrows a stored timezone to the supported list (falls back to UTC). */
export function toSupportedTimezone(value: string | null | undefined): Timezone {
  return (TIMEZONES as readonly string[]).includes(value ?? "") ? (value as Timezone) : "UTC";
}

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/config/site";
import { en } from "./dictionaries/en";
import { ro, type Dictionary } from "./dictionaries/ro";
import { ru } from "./dictionaries/ru";

export type { Dictionary } from "./dictionaries/ro";

const DICTIONARIES: Record<Locale, Dictionary> = { ro, ru, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** Replaces {placeholders} in a translated string. Unknown keys are left as-is. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

/** Picks the best supported locale from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const candidates = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", q = "q=1"] = part.trim().split(";");
      return { lang: tag.toLowerCase().split("-")[0], q: Number(q.replace("q=", "")) || 0 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { lang } of candidates) {
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/config/site";
import { getDictionary, negotiateLocale, type Dictionary } from "./index";

/**
 * Resolves the UI locale for the current request:
 * explicit cookie (set from profile / language switcher) → Accept-Language → default.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const headerStore = await headers();
  return negotiateLocale(headerStore.get("accept-language"));
}

export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getRequestLocale();
  return { locale, t: getDictionary(locale) };
}

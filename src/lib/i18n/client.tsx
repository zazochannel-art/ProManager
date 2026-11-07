"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/config/site";
import type { Dictionary } from "./dictionaries/ro";

interface I18nContextValue {
  locale: Locale;
  t: Dictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, dictionary, children }: { locale: Locale; dictionary: Dictionary; children: ReactNode }) {
  return <I18nContext value={{ locale, t: dictionary }}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

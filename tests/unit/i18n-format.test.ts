import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/dictionaries/en";
import { ro } from "@/lib/i18n/dictionaries/ro";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { interpolate, negotiateLocale } from "@/lib/i18n";
import { translateValidationMessage } from "@/lib/validation/messages";
import { formatMoney } from "@/lib/currency/format";
import { todayInTimeZone } from "@/lib/utils/dates";
import { advanceFrom, nextOnboardingStep, wizardPosition } from "@/features/organizations/services/onboarding";
import { suggestSlug } from "@/features/organizations/schemas/organization";
import { parsePageParam } from "@/lib/utils/search-params";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function placeholders(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof obj === "string") out[prefix] = (obj.match(/\{\w+\}/g) ?? []).sort().join(",");
  else if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) Object.assign(out, placeholders(v, prefix ? `${prefix}.${k}` : k));
  return out;
}

describe("translations", () => {
  it("have the same keys in ro, ru and en", () => {
    const reference = keys(ro).sort();
    expect(keys(en).sort()).toEqual(reference);
    expect(keys(ru).sort()).toEqual(reference);
  });

  it("use the same placeholders in every language", () => {
    const reference = placeholders(ro);
    expect(placeholders(en)).toEqual(reference);
    expect(placeholders(ru)).toEqual(reference);
  });

  it("have no empty strings", () => {
    for (const dict of [ro, ru, en]) {
      for (const [key, value] of Object.entries(placeholders(dict))) expect(key && value !== undefined).toBeTruthy();
      expect(JSON.stringify(dict)).not.toContain('""');
    }
  });

  it("interpolates and translates validation keys", () => {
    expect(interpolate("Pasul {current} din {total}", { current: 2, total: 6 })).toBe("Pasul 2 din 6");
    expect(translateValidationMessage(en, "minLength:2")).toBe("Must be at least 2 characters.");
    expect(translateValidationMessage(ro, "unknown-key")).toBe(ro.common.genericError);
  });

  it("negotiates the locale from Accept-Language", () => {
    expect(negotiateLocale("ru-RU,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(negotiateLocale("de-DE,en;q=0.5")).toBe("en");
    expect(negotiateLocale("fr-FR")).toBe("ro");
    expect(negotiateLocale(null)).toBe("ro");
  });
});

describe("formatting", () => {
  it("formats MDL, RON and EUR exactly", () => {
    expect(formatMoney("1234.5", "MDL", "en")).toMatch(/MDL\s?1,234\.50/);
    expect(formatMoney("1234.5", "RON", "ro")).toMatch(/1\.234,50\sRON/);
    expect(formatMoney("0.1", "EUR", "ru")).toMatch(/0,10\sEUR/);
    expect(formatMoney("12345678901234.99", "EUR", "en")).toContain("12,345,678,901,234.99");
  });

  it("computes 'today' in the organization's time zone", () => {
    const instant = new Date("2026-01-01T22:30:00Z");
    expect(todayInTimeZone("Europe/Chisinau", instant)).toBe("2026-01-02");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-01-01");
  });
});

describe("onboarding progression", () => {
  it("moves forward and never backwards", () => {
    expect(nextOnboardingStep("company")).toBe("regional");
    expect(nextOnboardingStep("project")).toBe("completed");
    expect(advanceFrom("company", "company")).toBe("regional");
    expect(advanceFrom("customer", "company")).toBe("customer");
    expect(advanceFrom("completed", "team")).toBe("completed");
    expect(wizardPosition("organization")).toBe(1);
    expect(wizardPosition("project")).toBe(6);
  });

  it("suggests URL-safe slugs", () => {
    expect(suggestSlug("Atelier Ștefan & Fiii SRL")).toMatch(/^[a-z0-9-]+$/);
    expect(suggestSlug("Atelier Ștefan & Fiii SRL")).toBe("atelier-stefan-fiii-srl");
  });

  it("parses page params defensively", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam("-1")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam(["2", "5"])).toBe(2);
    expect(parsePageParam("999999")).toBe(10_000);
  });
});

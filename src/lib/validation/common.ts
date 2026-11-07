import { z } from "zod";
import { CURRENCIES, LOCALES, TIMEZONES } from "@/config/site";
import { ROLES } from "@/lib/permissions/matrix";
import { isDecimalString } from "@/lib/calculations/decimal";

/**
 * Shared Zod building blocks. Error messages are translation KEYS
 * ("required", "minLength:2", …) resolved by translateValidationMessage(),
 * so the same schema validates on the client and on the server in any locale.
 */
export const requiredText = (min = 1, max = 200) =>
  z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .min(min, { error: `minLength:${min}` })
    .max(max, { error: `maxLength:${max}` });

/** Optional free text; empty strings become undefined. */
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, { error: `maxLength:${max}` })
    .optional()
    .transform((v) => (v ? v : undefined));

export const emailField = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(200, { error: "maxLength:200" })
  .pipe(z.email({ error: "email" }))
  .transform((v) => v.toLowerCase());

export const optionalEmail = z
  .string()
  .trim()
  .max(200, { error: "maxLength:200" })
  .optional()
  .refine((v) => !v || z.email().safeParse(v).success, { error: "email" })
  .transform((v) => (v ? v.toLowerCase() : undefined));

export const slugField = z
  .string({ error: "required" })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, { error: "slug" });

/** Money input as an exact decimal string with at most 2 decimals, ≥ 0. */
export const moneyField = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => v === "" || (isDecimalString(v) && !v.startsWith("-") && /^\d+(\.\d{1,2})?$/.test(v)), {
    error: "number",
  })
  .refine((v) => v === "" || Number(v) < 1e12, { error: "number" });

export const optionalMoney = moneyField.optional().transform((v) => (v ? v : undefined));

export const dateField = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), { error: "date" });

export const optionalDate = dateField.optional().transform((v) => (v ? v : undefined));

export const currencyField = z.enum(CURRENCIES, { error: "invalidOption" });
export const localeField = z.enum(LOCALES, { error: "invalidOption" });
export const timezoneField = z.enum(TIMEZONES, { error: "invalidOption" });
export const countryField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { error: "invalidOption" });
export const roleField = z.enum(ROLES, { error: "invalidOption" });
export const uuidField = z.uuid({ error: "invalidOption" });

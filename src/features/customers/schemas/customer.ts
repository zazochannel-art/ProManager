import { z } from "zod";
import { countryField, optionalEmail, optionalText, requiredText } from "@/lib/validation/common";

export const CUSTOMER_TYPES = ["company", "individual"] as const;
export const ADDRESS_TYPES = ["billing", "site", "shipping", "other"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export const customerCreateSchema = z.object({
  type: z.enum(CUSTOMER_TYPES, { error: "invalidOption" }),
  name: requiredText(1, 200),
  email: optionalEmail,
  phone: optionalText(40),
  taxId: optionalText(40),
});

export type CustomerCreateInput = z.input<typeof customerCreateSchema>;

/** Optional http(s) URL; a bare domain gets https:// in front. */
const optionalWebsite = z
  .string()
  .trim()
  .max(200, { error: "maxLength:200" })
  .optional()
  .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
  .refine((v) => v === undefined || z.url({ protocol: /^https?$/ }).safeParse(v).success, { error: "url" });

export const customerUpdateSchema = customerCreateSchema.extend({
  legalName: optionalText(200),
  website: optionalWebsite,
  notes: optionalText(5000),
});

export type CustomerUpdateInput = z.input<typeof customerUpdateSchema>;

export const contactSchema = z.object({
  fullName: requiredText(1, 200),
  position: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  isPrimary: z.boolean().default(false),
});

export type ContactInput = z.input<typeof contactSchema>;

export const addressSchema = z.object({
  type: z.enum(ADDRESS_TYPES, { error: "invalidOption" }),
  line1: requiredText(1, 200),
  line2: optionalText(200),
  city: optionalText(100),
  region: optionalText(100),
  postalCode: optionalText(20),
  countryCode: countryField,
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.input<typeof addressSchema>;

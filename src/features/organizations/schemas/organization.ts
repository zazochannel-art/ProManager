import { z } from "zod";
import {
  countryField,
  currencyField,
  emailField,
  localeField,
  optionalEmail,
  optionalText,
  requiredText,
  roleField,
  slugField,
  timezoneField,
} from "@/lib/validation/common";

export const createOrganizationSchema = z.object({
  name: requiredText(2, 120),
  slug: slugField,
});

export const companyDetailsSchema = z.object({
  name: requiredText(2, 120),
  legalName: optionalText(200),
  taxId: optionalText(40),
  registrationNumber: optionalText(40),
  email: optionalEmail,
  phone: optionalText(40),
  addressLine1: optionalText(200),
  city: optionalText(100),
  postalCode: optionalText(20),
});

export const regionalSettingsSchema = z.object({
  countryCode: countryField,
  currency: currencyField,
  locale: localeField,
  timezone: timezoneField,
});

export const inviteMemberSchema = z.object({
  email: emailField,
  role: roleField.refine((r) => r !== "owner", { error: "invalidOption" }),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.uuid(),
  role: roleField,
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type CompanyDetailsInput = z.input<typeof companyDetailsSchema>;
export type RegionalSettingsInput = z.input<typeof regionalSettingsSchema>;
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

/** Turns a company name into a workspace slug suggestion ("Construct SRL" → "construct-srl"). */
export function suggestSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base.length >= 3 ? base : `${base || "org"}-${Math.random().toString(36).slice(2, 6)}`;
}

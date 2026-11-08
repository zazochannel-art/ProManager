import { z } from "zod";
import { localeField, requiredText, timezoneField } from "@/lib/validation/common";

export const profileSchema = z.object({
  fullName: requiredText(2, 120),
  locale: localeField,
  timezone: timezoneField,
});

export type ProfileInput = z.input<typeof profileSchema>;

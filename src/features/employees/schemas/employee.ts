import { z } from "zod";
import { currencyField, optionalDate, optionalEmail, optionalMoney, optionalText, requiredText } from "@/lib/validation/common";

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contractor", "seasonal"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const employeeSchema = z.object({
  firstName: requiredText(1, 100),
  lastName: optionalText(100),
  position: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  employmentType: z.enum(EMPLOYMENT_TYPES, { error: "invalidOption" }),
  /** Cost of one hour of work for the company (labour cost of time entries). */
  hourlyCost: optionalMoney,
  costCurrency: currencyField,
  hireDate: optionalDate,
  /** Linked application account (organization member); "none" = no login. */
  userId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : undefined))
    .pipe(z.uuid({ error: "invalidOption" }).optional()),
  isActive: z.boolean(),
});

export type EmployeeInput = z.input<typeof employeeSchema>;

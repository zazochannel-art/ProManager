import { z } from "zod";
import { currencyField, optionalDate, optionalMoney, optionalText, requiredText } from "@/lib/validation/common";

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projectCreateSchema = z
  .object({
    name: requiredText(1, 200),
    code: optionalText(40),
    customerId: z
      .string()
      .optional()
      .transform((v) => (v && v !== "none" ? v : undefined))
      .pipe(z.uuid({ error: "invalidOption" }).optional()),
    status: z.enum(PROJECT_STATUSES, { error: "invalidOption" }),
    startDate: optionalDate,
    endDate: optionalDate,
    budget: optionalMoney,
    currency: currencyField,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], error: "dateOrder" });

export type ProjectCreateInput = z.input<typeof projectCreateSchema>;

import { z } from "zod";
import { optionalText, requiredText } from "@/lib/validation/common";

const isoDate = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), { error: "date" });
const time = z
  .string()
  .trim()
  .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), { error: "time" });
const optionalReference = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" ? v : undefined))
  .pipe(z.uuid({ error: "invalidOption" }).optional());

/** Dates/times are wall-clock values in the organization's time zone. */
export const eventCreateSchema = z
  .object({
    title: requiredText(1, 300),
    allDay: z.boolean(),
    startDate: isoDate,
    startTime: time,
    endDate: isoDate,
    endTime: time,
    location: optionalText(300),
    description: optionalText(5000),
    projectId: optionalReference,
    customerId: optionalReference,
  })
  .refine((v) => v.allDay || v.startTime !== "", { path: ["startTime"], error: "required" })
  .refine((v) => v.allDay || v.endTime !== "", { path: ["endTime"], error: "required" })
  .refine((v) => (v.allDay ? v.endDate >= v.startDate : `${v.endDate}T${v.endTime}` >= `${v.startDate}T${v.startTime}`), {
    path: ["endDate"],
    error: "dateOrder",
  });

export type EventCreateInput = z.input<typeof eventCreateSchema>;

import { z } from "zod";
import { optionalDate, optionalText, requiredText } from "@/lib/validation/common";

/** Hours as an exact decimal string (e.g. "7.5"), up to 2 decimals. */
const hoursPattern = /^\d{1,4}(\.\d{1,2})?$/;
const normalizeHours = (v: string) => v.trim().replace(",", ".");

export const phaseCreateSchema = z
  .object({
    name: requiredText(1, 200),
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    plannedHours: z
      .string()
      .optional()
      .transform((v) => (v ? normalizeHours(v) : undefined))
      .refine((v) => v === undefined || (hoursPattern.test(v) && Number(v) < 100_000), { error: "hoursTotal" }),
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedEnd >= v.plannedStart, { path: ["plannedEnd"], error: "dateOrder" });
export type PhaseCreateInput = z.input<typeof phaseCreateSchema>;

export const PHASE_PROGRESS_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const phaseProgressSchema = z.coerce.number({ error: "number" }).int({ error: "number" }).min(0, { error: "number" }).max(100, { error: "number" });

export const PROJECT_MEMBER_ROLES = ["lead", "member", "observer"] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];
export const projectMemberRoleSchema = z.enum(PROJECT_MEMBER_ROLES, { error: "invalidOption" });
export const projectMemberAddSchema = z.object({
  userId: z.uuid({ error: "required" }),
  role: projectMemberRoleSchema,
});
export type ProjectMemberAddInput = z.input<typeof projectMemberAddSchema>;

export const timeEntryCreateSchema = z.object({
  /** Work day (YYYY-MM-DD) in the organization's time zone. */
  date: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), { error: "date" }),
  hours: z
    .string({ error: "required" })
    .transform(normalizeHours)
    .refine((v) => v !== "", { error: "required" })
    .refine((v) => hoursPattern.test(v) && Number(v) > 0 && Number(v) <= 24, { error: "hours" }),
  notes: optionalText(2000),
  billable: z.boolean(),
  /** Whose time this is; managers may log for others. Missing = the current user. */
  userId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "self" ? v : undefined))
    .pipe(z.uuid({ error: "invalidOption" }).optional()),
});
export type TimeEntryCreateInput = z.input<typeof timeEntryCreateSchema>;

/** "7.5" → 450 minutes (exact for 2-decimal inputs, rounded to the minute). */
export function hoursToMinutes(hours: string): number {
  const [whole, frac = ""] = hours.split(".");
  const hundredths = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Math.round((hundredths * 60) / 100);
}

/** 450 → "7.5" for display (trailing zeros dropped). */
export function minutesToHours(minutes: number): string {
  const hundredths = Math.round((minutes * 100) / 60);
  const whole = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

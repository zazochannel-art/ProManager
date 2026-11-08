import { z } from "zod";
import { currencyField, optionalDate, optionalMoney, optionalText, requiredText } from "@/lib/validation/common";

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_VARIANT: Record<ProjectStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  planned: "neutral",
  active: "primary",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
};

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

export const projectUpdateSchema = projectCreateSchema;
export type ProjectUpdateInput = ProjectCreateInput;

export const projectStatusSchema = z.enum(PROJECT_STATUSES, { error: "invalidOption" });

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const taskCreateSchema = z.object({
  title: requiredText(1, 300),
  priority: z.enum(TASK_PRIORITIES, { error: "invalidOption" }),
  dueDate: optionalDate,
  assigneeId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : undefined))
    .pipe(z.uuid({ error: "invalidOption" }).optional()),
});

export type TaskCreateInput = z.input<typeof taskCreateSchema>;

export const taskStatusSchema = z.enum(TASK_STATUSES, { error: "invalidOption" });

export const TASK_STATUS_VARIANT: Record<TaskStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  todo: "neutral",
  in_progress: "primary",
  blocked: "warning",
  done: "success",
  cancelled: "danger",
};

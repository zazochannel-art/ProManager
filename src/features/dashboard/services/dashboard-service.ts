import "server-only";
import { z } from "zod";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

/** Postgres numerics arrive through JSON as numbers or strings; keep them as exact strings. */
const numeric = z.union([z.number(), z.string()]).transform((v) => String(v));

const summarySchema = z.object({
  currency: z.string(),
  today: z.string(),
  month_start: z.string(),
  revenue_month: numeric,
  cash_collected_month: numeric,
  expenses_month: numeric,
  other_currency_documents_month: z.number(),
  active_projects: z.number(),
  completed_projects: z.number(),
  pending_invoices: z.object({ count: z.number(), amount: numeric }),
  overdue_invoices: z.object({ count: z.number(), amount: numeric }),
  monthly: z.array(z.object({ month: z.string(), revenue: numeric, expenses: numeric, cash_collected: numeric })),
  recent_customers: z.array(z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), type: z.string(), created_at: z.string() })),
  upcoming_tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      priority: z.string(),
      due_at: z.string().nullable(),
      project_id: z.string().nullable(),
      project_name: z.string().nullable(),
    }),
  ),
  recent_activity: z.array(
    z.object({
      id: z.string(),
      entity_type: z.string(),
      entity_id: z.string().nullable(),
      action: z.string(),
      summary: z.string().nullable(),
      created_at: z.string(),
      actor_name: z.string().nullable(),
    }),
  ),
});

export type DashboardSummary = z.infer<typeof summarySchema>;

/**
 * Loads all dashboard figures in a single database round-trip. Every number
 * is computed by `public.dashboard_summary` under the caller's RLS; nothing is
 * hard-coded or estimated in the application.
 */
export async function getDashboardSummary(supabase: ServerSupabaseClient, organizationId: string, months = 6): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc("dashboard_summary", { p_organization_id: organizationId, p_months: months });
  if (error) throw new Error(`dashboard_summary failed: ${error.message}`);
  const parsed = summarySchema.safeParse(data);
  if (!parsed.success) throw new Error(`dashboard_summary returned an unexpected shape: ${parsed.error.message}`);
  return parsed.data;
}

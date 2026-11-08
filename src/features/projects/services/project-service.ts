import "server-only";
import { z } from "zod";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type ProjectListItem = Pick<
  Tables<"projects">,
  "id" | "name" | "code" | "status" | "start_date" | "end_date" | "budget_amount" | "currency" | "created_at"
> & { customer_name: string | null };

export const PROJECTS_PAGE_SIZE = 25;

export async function listProjects(
  supabase: ServerSupabaseClient,
  organizationId: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: ProjectListItem[]; total: number }> {
  const pageSize = options.pageSize ?? PROJECTS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("projects")
    .select("id, name, code, status, start_date, end_date, budget_amount, currency, created_at, customers(name)", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  const rows = (data ?? []).map((row) => {
    const { customers, ...rest } = row as typeof row & { customers: { name: string } | null };
    return { ...rest, customer_name: customers?.name ?? null };
  });
  return { rows, total: count ?? 0 };
}

export type ProjectDetail = Pick<
  Tables<"projects">,
  | "id"
  | "name"
  | "code"
  | "description"
  | "status"
  | "start_date"
  | "end_date"
  | "budget_amount"
  | "currency"
  | "site_address"
  | "customer_id"
  | "completed_at"
  | "created_at"
> & { customer_name: string | null };

export async function getProject(supabase: ServerSupabaseClient, organizationId: string, projectId: string): Promise<ProjectDetail | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, code, description, status, start_date, end_date, budget_amount, currency, site_address, customer_id, completed_at, created_at, customers(name)")
    .eq("organization_id", organizationId)
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load project: ${error.message}`);
  if (!data) return null;
  const { customers, ...rest } = data as typeof data & { customers: { name: string } | null };
  return { ...rest, customer_name: customers?.name ?? null };
}

export type ProjectTask = Pick<Tables<"tasks">, "id" | "title" | "status" | "priority" | "due_at" | "assignee_id" | "completed_at">;

export async function listProjectTasks(supabase: ServerSupabaseClient, organizationId: string, projectId: string): Promise<ProjectTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_at, assignee_id, completed_at")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`Failed to list project tasks: ${error.message}`);
  return data ?? [];
}

const numeric = z.union([z.number(), z.string()]).transform((v) => String(v));
const financialsSchema = z.object({
  currency: z.string(),
  budget: numeric.nullable(),
  revenue: numeric,
  cash_collected: numeric,
  material_costs: numeric,
  labor_expenses: numeric,
  labor_time_cost: numeric,
  other_costs: numeric,
  excluded_foreign_currency_items: z.number(),
});

export type ProjectFinancials = z.infer<typeof financialsSchema>;

/** Aggregates computed by public.project_financials under the caller's RLS. */
export async function getProjectFinancials(supabase: ServerSupabaseClient, organizationId: string, projectId: string): Promise<ProjectFinancials | null> {
  const { data, error } = await supabase.rpc("project_financials", { p_organization_id: organizationId, p_project_id: projectId });
  if (error) throw new Error(`project_financials failed: ${error.message}`);
  if (data === null) return null;
  const parsed = financialsSchema.safeParse(data);
  if (!parsed.success) throw new Error(`project_financials returned an unexpected shape: ${parsed.error.message}`);
  return parsed.data;
}

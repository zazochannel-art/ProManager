import "server-only";
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

import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type EmployeeListItem = Pick<
  Tables<"employees">,
  "id" | "first_name" | "last_name" | "email" | "phone" | "position" | "employment_type" | "hourly_cost" | "cost_currency" | "hire_date" | "is_active" | "user_id"
>;

/** Employees of the organization (team.read), active first, then by name. */
export async function listEmployees(supabase: ServerSupabaseClient, organizationId: string, options: { includeInactive?: boolean } = {}): Promise<EmployeeListItem[]> {
  let query = supabase
    .from("employees")
    .select("id, first_name, last_name, email, phone, position, employment_type, hourly_cost, cost_currency, hire_date, is_active, user_id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (!options.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.order("is_active", { ascending: false }).order("first_name").order("last_name").limit(1000);
  if (error) throw new Error(`Failed to list employees: ${error.message}`);
  return data ?? [];
}

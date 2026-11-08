import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type CustomerListItem = Pick<Tables<"customers">, "id" | "name" | "type" | "email" | "phone" | "tax_id" | "created_at">;

export const CUSTOMERS_PAGE_SIZE = 25;

/** Lists customers of ONE organization (explicit filter + RLS). */
export async function listCustomers(
  supabase: ServerSupabaseClient,
  organizationId: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: CustomerListItem[]; total: number }> {
  const pageSize = options.pageSize ?? CUSTOMERS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("customers")
    .select("id, name, type, email, phone, tax_id, created_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Failed to list customers: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listCustomerOptions(supabase: ServerSupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name")
    .limit(500);
  if (error) throw new Error(`Failed to list customers: ${error.message}`);
  return data ?? [];
}

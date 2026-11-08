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

export type CustomerDetail = Pick<
  Tables<"customers">,
  "id" | "name" | "type" | "legal_name" | "email" | "phone" | "tax_id" | "website" | "notes" | "preferred_currency" | "created_at" | "updated_at"
>;
export type CustomerContact = Pick<Tables<"customer_contacts">, "id" | "full_name" | "position" | "email" | "phone" | "is_primary">;
export type CustomerAddress = Pick<
  Tables<"customer_addresses">,
  "id" | "type" | "line1" | "line2" | "city" | "region" | "postal_code" | "country_code" | "is_default"
>;
export type CustomerProject = Pick<Tables<"projects">, "id" | "name" | "code" | "status" | "start_date" | "end_date">;

/** One customer of ONE organization, or null when it does not exist, is archived or is not visible. */
export async function getCustomer(supabase: ServerSupabaseClient, organizationId: string, customerId: string): Promise<CustomerDetail | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, type, legal_name, email, phone, tax_id, website, notes, preferred_currency, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load customer: ${error.message}`);
  return data;
}

export async function listCustomerContacts(supabase: ServerSupabaseClient, organizationId: string, customerId: string): Promise<CustomerContact[]> {
  const { data, error } = await supabase
    .from("customer_contacts")
    .select("id, full_name, position, email, phone, is_primary")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("is_primary", { ascending: false })
    .order("full_name");
  if (error) throw new Error(`Failed to list contacts: ${error.message}`);
  return data ?? [];
}

export async function listCustomerAddresses(supabase: ServerSupabaseClient, organizationId: string, customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("id, type, line1, line2, city, region, postal_code, country_code, is_default")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw new Error(`Failed to list addresses: ${error.message}`);
  return data ?? [];
}

export async function listCustomerProjects(supabase: ServerSupabaseClient, organizationId: string, customerId: string): Promise<CustomerProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, code, status, start_date, end_date")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to list customer projects: ${error.message}`);
  return data ?? [];
}

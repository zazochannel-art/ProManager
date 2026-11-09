import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { portalAccessStatus, type PortalAccessStatus } from "../schemas/portal";

export interface PortalAccessRow {
  id: string;
  customer_id: string;
  customer_name: string | null;
  email: string;
  can_view_invoices: boolean;
  can_view_estimates: boolean;
  can_view_projects: boolean;
  expires_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  status: PortalAccessStatus;
}

/** Portal links of the organization (RLS: portal.manage), active ones first. */
export async function listPortalAccess(supabase: ServerSupabaseClient, organizationId: string): Promise<PortalAccessRow[]> {
  const { data, error } = await supabase
    .from("client_portal_access")
    .select("id, customer_id, email, can_view_invoices, can_view_estimates, can_view_projects, expires_at, revoked_at, last_accessed_at, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to list portal access: ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.customer_id))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const customers = await supabase.from("customers").select("id, name").eq("organization_id", organizationId).in("id", ids);
    if (customers.error) throw new Error(`Failed to load customers: ${customers.error.message}`);
    for (const c of customers.data ?? []) names.set(c.id, c.name);
  }
  const now = new Date();
  const order: Record<PortalAccessStatus, number> = { active: 0, expired: 1, revoked: 2 };
  return rows
    .map((r) => ({ ...r, customer_name: names.get(r.customer_id) ?? null, status: portalAccessStatus(r, now) }))
    .sort((a, b) => order[a.status] - order[b.status]);
}

/** Customers that can get a link, with their e-mail to prefill the form. */
export async function listPortalCustomerOptions(supabase: ServerSupabaseClient, organizationId: string): Promise<{ id: string; name: string; email: string | null }[]> {
  const { data, error } = await supabase.from("customers").select("id, name, email").eq("organization_id", organizationId).is("deleted_at", null).order("name").limit(500);
  if (error) throw new Error(`Failed to list customers: ${error.message}`);
  return data ?? [];
}

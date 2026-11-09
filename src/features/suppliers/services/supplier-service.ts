import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { add, toFixed } from "@/lib/calculations/decimal";

export const SUPPLIERS_PAGE_SIZE = 25;

export interface SupplierListItem {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
}

/** "%" and "_" are wildcards in ilike; a search for "50%" must match the text. */
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listSuppliers(
  supabase: ServerSupabaseClient,
  organizationId: string,
  { page, q }: { page: number; q?: string },
): Promise<{ rows: SupplierListItem[]; total: number }> {
  const from = (page - 1) * SUPPLIERS_PAGE_SIZE;
  let query = supabase
    .from("suppliers")
    .select("id, name, tax_id, email, phone, website, address, notes", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (q) {
    const p = `%${escapeLike(q)}%`;
    query = query.or(`name.ilike.${JSON.stringify(p)},tax_id.ilike.${JSON.stringify(p)},email.ilike.${JSON.stringify(p)}`);
  }
  const { data, error, count } = await query.order("name").range(from, from + SUPPLIERS_PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to list suppliers: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Expenses per supplier since `since`, per currency (expenses.read decides what is visible). */
export async function getSupplierSpend(
  supabase: ServerSupabaseClient,
  organizationId: string,
  supplierIds: string[],
  since: string,
): Promise<Record<string, { totals: Record<string, string>; count: number }>> {
  if (supplierIds.length === 0) return {};
  const { data, error } = await supabase
    .from("expenses")
    .select("supplier_id, total, currency")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("supplier_id", supplierIds)
    .gte("expense_date", since)
    .limit(10000);
  if (error) throw new Error(`Failed to load supplier spend: ${error.message}`);
  const out: Record<string, { totals: Record<string, string>; count: number }> = {};
  for (const row of data ?? []) {
    if (!row.supplier_id) continue;
    const entry = (out[row.supplier_id] ??= { totals: {}, count: 0 });
    entry.count += 1;
    entry.totals[row.currency] = toFixed(add(entry.totals[row.currency] ?? "0", row.total ?? 0));
  }
  return out;
}

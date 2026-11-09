import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { add, mul, round, toFixed } from "@/lib/calculations/decimal";
import { escapeLike } from "@/features/suppliers/services/supplier-service";
import { isLowStock, type MovementType } from "../schemas/inventory";

export const INVENTORY_VIEWS = ["all", "low", "empty"] as const;
export type InventoryView = (typeof INVENTORY_VIEWS)[number];

/** numeric(14,3) "12.500" → "12.5"; "4.000" → "4". */
export function trimQuantity(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "0";
  const s = String(v);
  return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
}

export interface InventoryItemRow {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  unit_cost: string | null;
  sale_price: string | null;
  currency: string | null;
  reorder_level: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  on_hand: string;
  /** on_hand × unit_cost, or null without a cost. */
  stock_value: string | null;
  low: boolean;
}

export interface InventorySummary {
  items: number;
  low: number;
  /** Stock value per currency (items with a unit cost and stock above zero). */
  value: Record<string, string>;
}

/**
 * The whole active catalogue with stock on hand (summed over warehouses from
 * the inventory_stock_levels view). Filtering and the summary run here, so a
 * catalogue of up to 2 000 items stays one round trip.
 */
export async function listInventory(
  supabase: ServerSupabaseClient,
  organizationId: string,
  { q, view }: { q?: string; view: InventoryView },
): Promise<{ rows: InventoryItemRow[]; summary: InventorySummary; truncated: boolean }> {
  const LIMIT = 2000;
  let query = supabase
    .from("inventory_items")
    .select("id, sku, name, description, unit, unit_cost, sale_price, currency, reorder_level, supplier_id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name")
    .limit(LIMIT + 1);
  if (q) {
    const p = JSON.stringify(`%${escapeLike(q)}%`);
    query = query.or(`name.ilike.${p},sku.ilike.${p}`);
  }
  const [items, levels, suppliers] = await Promise.all([
    query,
    supabase.from("inventory_stock_levels").select("item_id, quantity_on_hand").eq("organization_id", organizationId).limit(20000),
    supabase.from("suppliers").select("id, name").eq("organization_id", organizationId).limit(2000),
  ]);
  if (items.error) throw new Error(`Failed to list inventory: ${items.error.message}`);
  if (levels.error) throw new Error(`Failed to load stock levels: ${levels.error.message}`);
  if (suppliers.error) throw new Error(`Failed to load suppliers: ${suppliers.error.message}`);

  const onHand = new Map<string, string>();
  for (const l of levels.data ?? []) {
    if (!l.item_id) continue;
    onHand.set(l.item_id, toFixed(add(onHand.get(l.item_id) ?? "0", l.quantity_on_hand ?? 0), 3));
  }
  const supplierNames = new Map((suppliers.data ?? []).map((s) => [s.id, s.name]));
  const all = (items.data ?? []).slice(0, LIMIT).map((r): InventoryItemRow => {
    const qty = onHand.get(r.id) ?? "0";
    const reorder = r.reorder_level === null ? null : trimQuantity(r.reorder_level);
    return {
      ...r,
      unit_cost: r.unit_cost === null ? null : toFixed(r.unit_cost),
      sale_price: r.sale_price === null ? null : toFixed(r.sale_price),
      reorder_level: reorder,
      supplier_name: r.supplier_id ? (supplierNames.get(r.supplier_id) ?? null) : null,
      on_hand: trimQuantity(qty),
      stock_value: r.unit_cost === null ? null : toFixed(round(mul(qty, r.unit_cost), 2)),
      low: isLowStock(qty, reorder),
    };
  });

  const summary: InventorySummary = { items: all.length, low: 0, value: {} };
  for (const r of all) {
    if (r.low) summary.low += 1;
    if (r.stock_value && r.currency && Number(r.on_hand) > 0) summary.value[r.currency] = toFixed(add(summary.value[r.currency] ?? "0", r.stock_value));
  }
  const rows = view === "low" ? all.filter((r) => r.low) : view === "empty" ? all.filter((r) => Number(r.on_hand) <= 0) : all;
  return { rows, summary, truncated: (items.data ?? []).length > LIMIT };
}

export interface MovementRow {
  id: string;
  movement_type: MovementType;
  quantity: string;
  unit_cost: string | null;
  occurred_at: string;
  reference: string | null;
  notes: string | null;
  project_id: string | null;
  project_name: string | null;
}

/** Latest movements of one item, newest first. */
export async function listItemMovements(supabase: ServerSupabaseClient, organizationId: string, itemId: string, limit = 50): Promise<MovementRow[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, movement_type, quantity, unit_cost, occurred_at, reference, notes, project_id")
    .eq("organization_id", organizationId)
    .eq("item_id", itemId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list stock movements: ${error.message}`);
  const projectIds = [...new Set((data ?? []).map((m) => m.project_id).filter((v): v is string => Boolean(v)))];
  let projects = new Map<string, string>();
  if (projectIds.length > 0) {
    const res = await supabase.from("projects").select("id, name").eq("organization_id", organizationId).in("id", projectIds);
    if (res.error) throw new Error(`Failed to load projects: ${res.error.message}`);
    projects = new Map((res.data ?? []).map((p) => [p.id, p.name]));
  }
  return (data ?? []).map((m) => ({
    ...m,
    quantity: trimQuantity(m.quantity),
    unit_cost: m.unit_cost === null ? null : toFixed(m.unit_cost),
    project_name: m.project_id ? (projects.get(m.project_id) ?? null) : null,
  }));
}

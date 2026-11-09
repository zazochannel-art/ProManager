"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { add, compare } from "@/lib/calculations/decimal";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { withDocumentContext } from "@/features/invoicing/actions/shared";
import { itemSchema, movementSchema, signedQuantity, type ItemInput, type ItemValues, type MovementInput } from "../schemas/inventory";
import { listItemMovements, type MovementRow } from "../services/inventory-service";

/**
 * Inventory (RLS: read inventory.read, write inventory.write). Stock is an
 * append-only ledger: corrections are new adjustment rows, never edits.
 */
function revalidateInventory() {
  revalidatePath("/dashboard/inventory");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function itemColumns(v: ItemValues) {
  return {
    name: v.name,
    sku: v.sku ?? null,
    unit: v.unit,
    description: v.description ?? null,
    unit_cost: v.unitCost ?? null,
    sale_price: v.salePrice ?? null,
    currency: v.currency,
    reorder_level: v.reorderLevel ?? null,
    supplier_id: v.supplierId ?? null,
  };
}

/** A duplicate SKU is reported on the field instead of as a generic conflict. */
function itemError(error: { code?: string; message?: string }): ActionResult<never> {
  if (error.code === "23505") return fail("validation", { fieldErrors: { sku: "duplicate" } });
  return fail(mapDatabaseError(error));
}

export async function createItemAction(input: ItemInput): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("inventory.write", [], async (ctx) => {
    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .insert({ organization_id: ctx.organization.id, ...itemColumns(parsed.data) })
      .select("id")
      .single();
    if (error) return itemError(error);
    revalidateInventory();
    return ok({ id: data.id });
  });
}

export async function updateItemAction(itemId: string, input: ItemInput): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("inventory.write", [itemId], async (ctx, [id]) => {
    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .update(itemColumns(parsed.data))
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return itemError(error);
    revalidateInventory();
    return ok({ id: data.id });
  });
}

/** Archiving hides the item; its movements and document lines stay. */
export async function archiveItemAction(itemId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("inventory.write", [itemId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateInventory();
    return ok({ id: id! });
  });
}

/** The organization's default warehouse, created on first use (one per org, enforced by a unique index). */
async function defaultWarehouse(supabase: Supabase, organizationId: string): Promise<{ id: string } | { error: { code?: string; message?: string } }> {
  const find = () => supabase.from("warehouses").select("id").eq("organization_id", organizationId).eq("is_default", true).maybeSingle();
  const existing = await find();
  if (existing.error) return { error: existing.error };
  if (existing.data) return { id: existing.data.id };
  const { t } = await getI18n();
  const created = await supabase.from("warehouses").insert({ organization_id: organizationId, name: t.inventory.defaultWarehouse, is_default: true }).select("id").single();
  if (!created.error) return { id: created.data.id };
  // Someone else created it at the same moment.
  if (created.error.code === "23505") {
    const again = await find();
    if (again.data) return { id: again.data.id };
  }
  return { error: created.error };
}

export async function recordMovementAction(itemId: string, input: MovementInput): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("inventory.write", [itemId], async (ctx, [id]) => {
    const parsed = movementSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const item = await supabase.from("inventory_items").select("id").eq("organization_id", ctx.organization.id).eq("id", id!).is("deleted_at", null).maybeSingle();
    if (item.error) return fail(mapDatabaseError(item.error));
    if (!item.data) return fail("not_found");

    const quantity = signedQuantity(v);
    if (quantity.startsWith("-")) {
      // The ledger itself allows negative stock; the form refuses taking out more than is there.
      const levels = await supabase.from("inventory_stock_levels").select("quantity_on_hand").eq("organization_id", ctx.organization.id).eq("item_id", id!);
      if (levels.error) return fail(mapDatabaseError(levels.error));
      const onHand = (levels.data ?? []).reduce((acc, l) => add(acc, l.quantity_on_hand ?? 0), add(0, 0));
      if (compare(v.quantity, onHand) > 0) return fail("validation", { fieldErrors: { quantity: "insufficientStock" } });
    }

    const warehouse = await defaultWarehouse(supabase, ctx.organization.id);
    if ("error" in warehouse) return fail(mapDatabaseError(warehouse.error));
    const { data, error } = await supabase
      .from("stock_movements")
      .insert({
        organization_id: ctx.organization.id,
        item_id: id!,
        warehouse_id: warehouse.id,
        project_id: v.projectId ?? null,
        movement_type: v.kind,
        quantity,
        unit_cost: v.unitCost ?? null,
        // Noon UTC keeps the chosen day in every timezone the app supports.
        occurred_at: `${v.occurredOn}T12:00:00Z`,
        reference: v.reference ?? null,
        notes: v.notes ?? null,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    // A receipt with a price updates the item's current cost.
    if (v.kind === "receipt" && v.unitCost) {
      const updated = await supabase.from("inventory_items").update({ unit_cost: v.unitCost }).eq("organization_id", ctx.organization.id).eq("id", id!);
      if (updated.error) return fail(mapDatabaseError(updated.error));
    }
    revalidateInventory();
    return ok({ id: data.id });
  });
}

export async function listItemMovementsAction(itemId: string): Promise<ActionResult<MovementRow[]>> {
  return withDocumentContext("inventory.read", [itemId], async (ctx, [id]) => {
    const supabase = await createClient();
    return ok(await listItemMovements(supabase, ctx.organization.id, id!));
  });
}

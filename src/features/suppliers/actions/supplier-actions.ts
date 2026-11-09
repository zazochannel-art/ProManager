"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { withDocumentContext } from "@/features/invoicing/actions/shared";
import { supplierSchema, type SupplierInput } from "../schemas/supplier";

/** Suppliers (RLS: read suppliers.read, write and archive suppliers.write). */
function columns(v: ReturnType<typeof supplierSchema.parse>) {
  return {
    name: v.name,
    tax_id: v.taxId ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    website: v.website ?? null,
    address: v.address ?? null,
    notes: v.notes ?? null,
  };
}

function revalidateSuppliers() {
  revalidatePath("/dashboard/suppliers");
  // Expense and inventory forms list suppliers too.
  revalidatePath("/dashboard", "layout");
}

export async function createSupplierAction(input: SupplierInput): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("suppliers.write", [], async (ctx) => {
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("suppliers")
      .insert({ organization_id: ctx.organization.id, country_code: ctx.organization.country_code ?? null, ...columns(parsed.data) })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateSuppliers();
    return ok({ id: data.id });
  });
}

export async function updateSupplierAction(supplierId: string, input: SupplierInput): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("suppliers.write", [supplierId], async (ctx, [id]) => {
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("suppliers")
      .update(columns(parsed.data))
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateSuppliers();
    return ok({ id: data.id });
  });
}

/** Archiving keeps the row, so expenses and items that point at it stay intact. */
export async function archiveSupplierAction(supplierId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("suppliers.write", [supplierId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("suppliers")
      .update({ deleted_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateSuppliers();
    return ok({ id: id! });
  });
}

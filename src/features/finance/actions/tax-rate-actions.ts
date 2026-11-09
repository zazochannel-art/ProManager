"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { withDocumentContext } from "@/features/invoicing/actions/shared";
import { taxRateSchema } from "../schemas/finance";

/**
 * VAT rates live in public.tax_rates (read: org.read, write/delete:
 * settings.manage, enforced by RLS). Line forms of estimates and invoices
 * offer the rates that apply on the document date, the default one first.
 */
function revalidateTaxRates() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Only one default rate: clear the flag on every other rate first. */
async function clearOtherDefaults(supabase: Supabase, organizationId: string, keepId?: string) {
  let query = supabase.from("tax_rates").update({ is_default: false }).eq("organization_id", organizationId).eq("is_default", true);
  if (keepId) query = query.neq("id", keepId);
  return query;
}

export async function createTaxRateAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("settings.manage", [], async (ctx) => {
    const parsed = taxRateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    if (v.isDefault) {
      const cleared = await clearOtherDefaults(supabase, ctx.organization.id);
      if (cleared.error) return fail(mapDatabaseError(cleared.error));
    }
    const { data, error } = await supabase
      .from("tax_rates")
      .insert({
        organization_id: ctx.organization.id,
        name: v.name,
        rate: v.rate,
        valid_from: v.validFrom,
        valid_to: v.validTo ?? null,
        is_default: v.isDefault,
        country_code: ctx.organization.country_code ?? null,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateTaxRates();
    return ok({ id: data.id });
  });
}

export async function updateTaxRateAction(taxRateId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("settings.manage", [taxRateId], async (ctx, [id]) => {
    const parsed = taxRateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    if (v.isDefault) {
      const cleared = await clearOtherDefaults(supabase, ctx.organization.id, id);
      if (cleared.error) return fail(mapDatabaseError(cleared.error));
    }
    // Lines keep their own copy of the percentage, so editing a rate never changes issued documents.
    const { data, error } = await supabase
      .from("tax_rates")
      .update({ name: v.name, rate: v.rate, valid_from: v.validFrom, valid_to: v.validTo ?? null, is_default: v.isDefault, ...(v.isDefault ? { is_active: true } : {}) })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateTaxRates();
    return ok({ id: data.id });
  });
}

export async function setDefaultTaxRateAction(taxRateId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("settings.manage", [taxRateId], async (ctx, [id]) => {
    const supabase = await createClient();
    const cleared = await clearOtherDefaults(supabase, ctx.organization.id, id);
    if (cleared.error) return fail(mapDatabaseError(cleared.error));
    const { data, error } = await supabase
      .from("tax_rates")
      .update({ is_default: true, is_active: true })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateTaxRates();
    return ok({ id: data.id });
  });
}

export async function setTaxRateActiveAction(taxRateId: string, active: boolean): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("settings.manage", [taxRateId], async (ctx, [id]) => {
    if (typeof active !== "boolean") return fail("validation");
    const supabase = await createClient();
    // An inactive rate cannot stay the default one.
    const { data, error } = await supabase
      .from("tax_rates")
      .update(active ? { is_active: true } : { is_active: false, is_default: false })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateTaxRates();
    return ok({ id: data.id });
  });
}

/** Deleting fails with "conflict" while a document line points at the rate; deactivate it instead. */
export async function deleteTaxRateAction(taxRateId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("settings.manage", [taxRateId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("tax_rates").delete().eq("organization_id", ctx.organization.id).eq("id", id!).select("id");
    if (error) return fail(error.code === "23503" ? "conflict" : mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateTaxRates();
    return ok({ id: id! });
  });
}

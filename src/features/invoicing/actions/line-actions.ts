"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { DOCUMENT_KINDS, lineSchema, type DocumentKind } from "../schemas/document";
import { withDocumentContext } from "./shared";

const kindSchema = z.enum(DOCUMENT_KINDS);
const permissionFor = (kind: DocumentKind) => (kind === "estimate" ? "estimates.write" : "invoices.write");
const pathFor = (kind: DocumentKind, id: string) => (kind === "estimate" ? `/dashboard/estimates/${id}` : `/dashboard/invoices/${id}`);

/**
 * Adds a line (lineId = null) or updates one. Line math is done by GENERATED
 * columns and the totals trigger; guard_document_items blocks changes to
 * issued invoices and accepted/converted estimates.
 */
export async function saveLineAction(kindInput: DocumentKind, documentId: string, lineId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const kind = kindSchema.safeParse(kindInput);
  if (!kind.success) return fail("not_found");
  const ids = lineId === null ? [documentId] : [documentId, lineId];
  return withDocumentContext(permissionFor(kind.data), ids, async (ctx, [docId, existingId]) => {
    const parsed = lineSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const values = {
      description: v.description,
      unit: v.unit,
      // NUMERIC columns: exact decimal strings, never floats.
      quantity: v.quantity,
      unit_price: v.unitPrice,
      discount_percent: v.discountPercent,
      tax_rate: v.taxRate,
    };
    const org = ctx.organization.id;

    if (existingId) {
      const { data, error } =
        kind.data === "estimate"
          ? await supabase.from("estimate_items").update(values).eq("organization_id", org).eq("estimate_id", docId!).eq("id", existingId).select("id").single()
          : await supabase.from("invoice_items").update(values).eq("organization_id", org).eq("invoice_id", docId!).eq("id", existingId).select("id").single();
      if (error) return fail(mapDatabaseError(error));
      revalidatePath(pathFor(kind.data, docId!));
      return ok({ id: data.id });
    }

    const last =
      kind.data === "estimate"
        ? await supabase.from("estimate_items").select("position").eq("organization_id", org).eq("estimate_id", docId!).order("position", { ascending: false }).limit(1)
        : await supabase.from("invoice_items").select("position").eq("organization_id", org).eq("invoice_id", docId!).order("position", { ascending: false }).limit(1);
    if (last.error) return fail(mapDatabaseError(last.error));
    const position = (last.data?.[0]?.position ?? -1) + 1;
    const { data, error } =
      kind.data === "estimate"
        ? await supabase.from("estimate_items").insert({ organization_id: org, estimate_id: docId!, position, ...values }).select("id").single()
        : await supabase.from("invoice_items").insert({ organization_id: org, invoice_id: docId!, position, ...values }).select("id").single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(pathFor(kind.data, docId!));
    return ok({ id: data.id });
  });
}

export async function deleteLineAction(kindInput: DocumentKind, documentId: string, lineId: string): Promise<ActionResult<{ id: string }>> {
  const kind = kindSchema.safeParse(kindInput);
  if (!kind.success) return fail("not_found");
  return withDocumentContext(permissionFor(kind.data), [documentId, lineId], async (ctx, [docId, id]) => {
    const supabase = await createClient();
    const org = ctx.organization.id;
    const { data, error } =
      kind.data === "estimate"
        ? await supabase.from("estimate_items").delete().eq("organization_id", org).eq("estimate_id", docId!).eq("id", id!).select("id")
        : await supabase.from("invoice_items").delete().eq("organization_id", org).eq("invoice_id", docId!).eq("id", id!).select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidatePath(pathFor(kind.data, docId!));
    return ok({ id: id! });
  });
}

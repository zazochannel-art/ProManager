"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { ESTIMATE_TRANSITIONS, estimateHeaderSchema, estimateStatusSchema, isEstimateStatus } from "../schemas/document";
import { withDocumentContext } from "./shared";

function revalidateEstimates(id?: string) {
  revalidatePath("/dashboard/estimates");
  if (id) revalidatePath(`/dashboard/estimates/${id}`);
}

export async function createEstimateAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("estimates.write", [], async (ctx) => {
    const parsed = estimateHeaderSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    // The number and (if empty) the validity date are assigned by the database.
    const { data, error } = await supabase
      .from("estimates")
      .insert({
        organization_id: ctx.organization.id,
        customer_id: v.customerId,
        project_id: v.projectId ?? null,
        currency: v.currency,
        issue_date: v.issueDate,
        valid_until: v.validUntil ?? null,
        title: v.title ?? null,
        notes: v.notes ?? null,
        terms: v.terms ?? null,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateEstimates();
    return ok({ id: data.id });
  });
}

export async function updateEstimateAction(estimateId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("estimates.write", [estimateId], async (ctx, [id]) => {
    const parsed = estimateHeaderSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estimates")
      .update({
        customer_id: v.customerId,
        project_id: v.projectId ?? null,
        currency: v.currency,
        issue_date: v.issueDate,
        valid_until: v.validUntil ?? null,
        title: v.title ?? null,
        notes: v.notes ?? null,
        terms: v.terms ?? null,
      })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateEstimates(id);
    return ok({ id: data.id });
  });
}

/** Manual status change (sent / accepted / rejected / back to draft). */
export async function setEstimateStatusAction(estimateId: string, status: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("estimates.write", [estimateId], async (ctx, [id]) => {
    const parsed = estimateStatusSchema.safeParse(status);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const current = await supabase.from("estimates").select("status").eq("organization_id", ctx.organization.id).eq("id", id!).is("deleted_at", null).maybeSingle();
    if (current.error) return fail(mapDatabaseError(current.error));
    if (!current.data) return fail("not_found");
    const from = current.data.status;
    if (!isEstimateStatus(from) || !ESTIMATE_TRANSITIONS[from].includes(parsed.data)) return fail("validation");
    // guard_estimate_update re-checks the lock and stamps sent_at / accepted_at.
    const { data, error } = await supabase
      .from("estimates")
      .update({ status: parsed.data })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .eq("status", from)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateEstimates(id);
    return ok({ id: data.id });
  });
}

/** Only drafts can be deleted (RLS policy "estimates: delete drafts"). */
export async function deleteEstimateAction(estimateId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("estimates.delete", [estimateId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("estimates").delete().eq("organization_id", ctx.organization.id).eq("id", id!).eq("status", "draft").select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateEstimates();
    return ok({ id: id! });
  });
}

/** Creates a draft invoice with the estimate's lines (convert_estimate_to_invoice). */
export async function convertEstimateAction(estimateId: string): Promise<ActionResult<{ invoiceId: string }>> {
  return withDocumentContext("invoices.write", [estimateId], async (ctx, [id]) => {
    if (!ctx.can("estimates.read")) return fail("forbidden");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("convert_estimate_to_invoice", { p_estimate_id: id! });
    if (error) return fail(mapDatabaseError(error));
    revalidateEstimates(id);
    revalidatePath("/dashboard/invoices");
    revalidatePath("/dashboard", "layout");
    return ok({ invoiceId: data });
  });
}

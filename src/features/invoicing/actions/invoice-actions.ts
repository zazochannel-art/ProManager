"use server";

import { revalidatePath } from "next/cache";
import { interpolate } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { compare } from "@/lib/calculations/decimal";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { invoiceHeaderSchema, paymentSchema, voidSchema } from "../schemas/document";
import { withDocumentContext } from "./shared";
import { formatMoney } from "@/lib/currency/format";
import { notifyLater } from "@/features/notifications/services/notify";

function revalidateInvoices(id?: string) {
  revalidatePath("/dashboard/invoices");
  if (id) revalidatePath(`/dashboard/invoices/${id}`);
  // Dashboard KPIs and project financials read invoices too.
  revalidatePath("/dashboard", "layout");
}

export async function createInvoiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("invoices.write", [], async (ctx) => {
    const parsed = invoiceHeaderSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    // Drafts have no number; issue_invoice() assigns the next one.
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        organization_id: ctx.organization.id,
        customer_id: v.customerId,
        project_id: v.projectId ?? null,
        currency: v.currency,
        issue_date: v.issueDate,
        due_date: v.dueDate ?? null,
        notes: v.notes ?? null,
        terms: v.terms ?? null,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateInvoices();
    return ok({ id: data.id });
  });
}

export async function updateInvoiceAction(invoiceId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("invoices.write", [invoiceId], async (ctx, [id]) => {
    const parsed = invoiceHeaderSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    // guard_invoice_update rejects changes once the invoice is issued.
    const { data, error } = await supabase
      .from("invoices")
      .update({
        customer_id: v.customerId,
        project_id: v.projectId ?? null,
        currency: v.currency,
        issue_date: v.issueDate,
        due_date: v.dueDate ?? null,
        notes: v.notes ?? null,
        terms: v.terms ?? null,
      })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateInvoices(id);
    return ok({ id: data.id });
  });
}

export async function issueInvoiceAction(invoiceId: string): Promise<ActionResult<{ number: string | null }>> {
  return withDocumentContext("invoices.write", [invoiceId], async (_ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("issue_invoice", { p_invoice_id: id! });
    if (error) return fail(mapDatabaseError(error));
    revalidateInvoices(id);
    return ok({ number: data?.number ?? null });
  });
}

export async function voidInvoiceAction(invoiceId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("invoices.write", [invoiceId], async (_ctx, [id]) => {
    const parsed = voidSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_invoice", { p_invoice_id: id!, p_reason: parsed.data.reason });
    if (error) return fail(mapDatabaseError(error));
    revalidateInvoices(id);
    return ok({ id: id! });
  });
}

/** Only drafts can be deleted (RLS policy "invoices: delete drafts"). */
export async function deleteInvoiceAction(invoiceId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("invoices.delete", [invoiceId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("invoices").delete().eq("organization_id", ctx.organization.id).eq("id", id!).eq("status", "draft").select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateInvoices();
    return ok({ id: id! });
  });
}

/**
 * Records a payment for one invoice through record_payment(), which locks the
 * invoice, checks currency, customer and balance, and is idempotent per key.
 */
export async function recordInvoicePaymentAction(invoiceId: string, input: unknown): Promise<ActionResult<{ paymentId: string }>> {
  return withDocumentContext("payments.write", [invoiceId], async (ctx, [id]) => {
    const parsed = paymentSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const invoice = await supabase
      .from("invoices")
      .select("customer_id, currency, status, balance_due, allow_overpayment, number")
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .maybeSingle();
    if (invoice.error) return fail(mapDatabaseError(invoice.error));
    if (!invoice.data) return fail("not_found");
    if (invoice.data.status !== "issued" && invoice.data.status !== "partially_paid") return fail("validation");
    if (!invoice.data.allow_overpayment && compare(v.amount, invoice.data.balance_due ?? 0) > 0) {
      return fail("validation", { fieldErrors: { amount: "exceedsBalance" } });
    }
    const { data, error } = await supabase.rpc("record_payment", {
      p_organization_id: ctx.organization.id,
      p_customer_id: invoice.data.customer_id,
      p_amount: v.amount,
      p_currency: invoice.data.currency,
      p_method: v.method,
      p_paid_on: v.paidOn,
      p_idempotency_key: v.idempotencyKey,
      p_allocations: [{ invoice_id: id!, amount: v.amount }],
      p_reference: v.reference ?? undefined,
    });
    if (error) {
      const code = mapDatabaseError(error);
      if (error.code === "23514") return fail("validation", { fieldErrors: { amount: "exceedsBalance" } });
      return fail(code);
    }
    revalidateInvoices(id);
    const { number, currency } = invoice.data;
    const named = await supabase.from("customers").select("name").eq("organization_id", ctx.organization.id).eq("id", invoice.data.customer_id).maybeSingle();
    const customer = named.data?.name ?? "";
    notifyLater({
      organizationId: ctx.organization.id,
      event: "payment.recorded",
      actorId: ctx.user.id,
      link: `/dashboard/invoices/${id}`,
      message: (t, locale) => ({
        title: interpolate(t.notifications.events["payment.recorded"].title, { amount: formatMoney(v.amount, currency, locale) }),
        body: interpolate(t.notifications.events["payment.recorded"].body, { customer, number: number ?? "—" }),
      }),
    });
    return ok({ paymentId: data });
  });
}

export async function voidPaymentAction(invoiceId: string, paymentId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("payments.write", [invoiceId, paymentId], async (_ctx, [id, payment]) => {
    const parsed = voidSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_payment", { p_payment_id: payment!, p_reason: parsed.data.reason });
    if (error) return fail(mapDatabaseError(error));
    revalidateInvoices(id);
    return ok({ id: payment! });
  });
}

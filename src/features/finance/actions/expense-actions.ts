"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { withDocumentContext } from "@/features/invoicing/actions/shared";
import { expenseCategorySchema, expenseSchema, markPaidSchema, type ExpenseValues } from "../schemas/finance";

/**
 * Expenses and their categories (RLS: read expenses.read, write
 * expenses.write, delete expenses.delete). Dashboard KPIs and project
 * financials read expenses, so every change revalidates the whole dashboard.
 */
function revalidateExpenses() {
  revalidatePath("/dashboard", "layout");
}

function columns(v: ExpenseValues) {
  return {
    description: v.description,
    kind: v.kind,
    category_id: v.categoryId ?? null,
    project_id: v.projectId ?? null,
    supplier_id: v.supplierId ?? null,
    amount: v.amount,
    tax_amount: v.taxAmount,
    currency: v.currency,
    expense_date: v.expenseDate,
    payment_status: v.paymentStatus,
    paid_on: v.paymentStatus === "paid" ? (v.paidOn ?? v.expenseDate) : null,
    reference: v.reference ?? null,
  };
}

export async function createExpenseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.write", [], async (ctx) => {
    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("expenses")
      .insert({ organization_id: ctx.organization.id, created_by: ctx.user.id, ...columns(parsed.data) })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateExpenses();
    return ok({ id: data.id });
  });
}

export async function updateExpenseAction(expenseId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.write", [expenseId], async (ctx, [id]) => {
    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("expenses")
      .update(columns(parsed.data))
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateExpenses();
    return ok({ id: data.id });
  });
}

export async function markExpensePaidAction(expenseId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.write", [expenseId], async (ctx, [id]) => {
    const parsed = markPaidSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("expenses")
      .update({ payment_status: "paid", paid_on: parsed.data.paidOn })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateExpenses();
    return ok({ id: data.id });
  });
}

/** Hard delete, so the database's expenses.delete policy (owners and admins) decides. */
export async function deleteExpenseAction(expenseId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.delete", [expenseId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("expenses").delete().eq("organization_id", ctx.organization.id).eq("id", id!).select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateExpenses();
    return ok({ id: id! });
  });
}

// --- Categories -----------------------------------------------------------------

export async function createExpenseCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.write", [], async (ctx) => {
    const parsed = expenseCategorySchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("expense_categories")
      .insert({ organization_id: ctx.organization.id, name: parsed.data.name, kind: parsed.data.kind })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return fail("validation", { fieldErrors: { name: "duplicate" } });
      return fail(mapDatabaseError(error));
    }
    revalidateExpenses();
    return ok({ id: data.id });
  });
}

export async function updateExpenseCategoryAction(categoryId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.write", [categoryId], async (ctx, [id]) => {
    const parsed = expenseCategorySchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("expense_categories")
      .update({ name: parsed.data.name, kind: parsed.data.kind })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return fail("validation", { fieldErrors: { name: "duplicate" } });
      return fail(mapDatabaseError(error));
    }
    revalidateExpenses();
    return ok({ id: data.id });
  });
}

export async function setExpenseCategoryActiveAction(categoryId: string, active: boolean): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.write", [categoryId], async (ctx, [id]) => {
    if (typeof active !== "boolean") return fail("validation");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("expense_categories")
      .update({ is_active: active })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidateExpenses();
    return ok({ id: data.id });
  });
}

/** Fails with "conflict" while expenses use the category; hide it instead. */
export async function deleteExpenseCategoryAction(categoryId: string): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("expenses.delete", [categoryId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("expense_categories").delete().eq("organization_id", ctx.organization.id).eq("id", id!).select("id");
    if (error) return fail(error.code === "23503" ? "conflict" : mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateExpenses();
    return ok({ id: id! });
  });
}

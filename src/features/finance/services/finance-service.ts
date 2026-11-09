import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { add, toFixed } from "@/lib/calculations/decimal";
import type { ExpenseKind, ExpensePaymentStatus } from "../schemas/finance";

export const FINANCE_PAGE_SIZE = 25;

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "0.00" : toFixed(v));

/** Adds `amount` to the per-currency running total. */
function addTo(totals: Record<string, string>, currency: string, amount: string | number | null) {
  totals[currency] = toFixed(add(totals[currency] ?? "0", amount ?? 0));
}

async function namesById(supabase: ServerSupabaseClient, table: "customers" | "projects" | "suppliers" | "expense_categories", organizationId: string, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map<string, string>();
  const { data, error } = await supabase.from(table).select("id, name").eq("organization_id", organizationId).in("id", unique);
  if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.id, r.name]));
}

/** First day of the month of an ISO date ("2026-11-09" → "2026-11-01"). */
export const monthStart = (today: string) => `${today.slice(0, 7)}-01`;

// --- VAT rates ------------------------------------------------------------------

export interface TaxRateRow {
  id: string;
  name: string;
  rate: string;
  valid_from: string;
  valid_to: string | null;
  is_default: boolean;
  is_active: boolean;
}

/** Every rate of the organization, current ones first (readable with org.read). */
export async function listTaxRates(supabase: ServerSupabaseClient, organizationId: string): Promise<TaxRateRow[]> {
  const { data, error } = await supabase
    .from("tax_rates")
    .select("id, name, rate, valid_from, valid_to, is_default, is_active")
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("is_default", { ascending: false })
    .order("valid_from", { ascending: false })
    .order("rate", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to list tax rates: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, rate: trimRate(r.rate) }));
}

/** numeric(7,4) arrives as "20.0000"; show "20" or "8.5". */
export function trimRate(rate: string | number): string {
  const s = String(rate);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

// --- Payments -------------------------------------------------------------------

export const PAYMENT_VIEWS = ["all", "month", "voided"] as const;
export type PaymentView = (typeof PAYMENT_VIEWS)[number];

export interface PaymentListItem {
  id: string;
  number: string;
  customer_name: string | null;
  amount: string;
  currency: string;
  method: string;
  paid_on: string;
  reference: string | null;
  voided_at: string | null;
  void_reason: string | null;
  invoices: { id: string; number: string | null }[];
}

export async function listPayments(
  supabase: ServerSupabaseClient,
  organizationId: string,
  { view, page, today }: { view: PaymentView; page: number; today: string },
): Promise<{ rows: PaymentListItem[]; total: number }> {
  const from = (page - 1) * FINANCE_PAGE_SIZE;
  let query = supabase
    .from("payments")
    .select("id, number, customer_id, amount, currency, method, paid_on, reference, voided_at, void_reason, payment_allocations(invoice_id, invoices(number))", { count: "exact" })
    .eq("organization_id", organizationId);
  // "all" shows voided payments too (marked as such); "month" counts only valid ones.
  if (view === "voided") query = query.not("voided_at", "is", null);
  if (view === "month") query = query.is("voided_at", null).gte("paid_on", monthStart(today)).lte("paid_on", today);
  const { data, error, count } = await query
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + FINANCE_PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to list payments: ${error.message}`);
  const customers = await namesById(supabase, "customers", organizationId, (data ?? []).map((r) => r.customer_id));
  return {
    rows: (data ?? []).map((r) => {
      const allocations = (r.payment_allocations ?? []) as unknown as { invoice_id: string; invoices: { number: string | null } | null }[];
      return {
        id: r.id,
        number: r.number,
        customer_name: customers.get(r.customer_id) ?? null,
        amount: str(r.amount),
        currency: r.currency,
        method: r.method,
        paid_on: r.paid_on,
        reference: r.reference,
        voided_at: r.voided_at,
        void_reason: r.void_reason,
        invoices: allocations.map((a) => ({ id: a.invoice_id, number: a.invoices?.number ?? null })),
      };
    }),
    total: count ?? 0,
  };
}

export interface PaymentSummary {
  /** Received this calendar month, per currency (voided payments excluded). */
  month: Record<string, string>;
  monthCount: number;
  /** Received in the last 12 months, per currency. */
  year: Record<string, string>;
}

export async function getPaymentSummary(supabase: ServerSupabaseClient, organizationId: string, today: string): Promise<PaymentSummary> {
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const { data, error } = await supabase
    .from("payments")
    .select("amount, currency, paid_on")
    .eq("organization_id", organizationId)
    .is("voided_at", null)
    .gt("paid_on", yearAgo)
    .lte("paid_on", today)
    .limit(10000);
  if (error) throw new Error(`Failed to summarize payments: ${error.message}`);
  const month: Record<string, string> = {};
  const year: Record<string, string> = {};
  let monthCount = 0;
  const start = monthStart(today);
  for (const row of data ?? []) {
    addTo(year, row.currency, row.amount);
    if (row.paid_on >= start) {
      monthCount += 1;
      addTo(month, row.currency, row.amount);
    }
  }
  return { month, monthCount, year };
}

// --- Expenses -------------------------------------------------------------------

export const EXPENSE_VIEWS = ["all", "month", "unpaid", "paid"] as const;
export type ExpenseView = (typeof EXPENSE_VIEWS)[number];

export interface ExpenseListItem {
  id: string;
  description: string;
  kind: ExpenseKind;
  category_id: string | null;
  category_name: string | null;
  project_id: string | null;
  project_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  amount: string;
  tax_amount: string;
  total: string;
  currency: string;
  expense_date: string;
  payment_status: ExpensePaymentStatus;
  paid_on: string | null;
  reference: string | null;
}

export async function listExpenses(
  supabase: ServerSupabaseClient,
  organizationId: string,
  { view, page, today, kind }: { view: ExpenseView; page: number; today: string; kind?: ExpenseKind },
): Promise<{ rows: ExpenseListItem[]; total: number }> {
  const from = (page - 1) * FINANCE_PAGE_SIZE;
  let query = supabase
    .from("expenses")
    .select("id, description, kind, category_id, project_id, supplier_id, amount, tax_amount, total, currency, expense_date, payment_status, paid_on, reference", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (view === "unpaid" || view === "paid") query = query.eq("payment_status", view);
  if (view === "month") query = query.gte("expense_date", monthStart(today)).lte("expense_date", today);
  if (kind) query = query.eq("kind", kind);
  const { data, error, count } = await query
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + FINANCE_PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to list expenses: ${error.message}`);
  const rows = data ?? [];
  const [categories, projects, suppliers] = await Promise.all([
    namesById(supabase, "expense_categories", organizationId, rows.map((r) => r.category_id)),
    namesById(supabase, "projects", organizationId, rows.map((r) => r.project_id)),
    namesById(supabase, "suppliers", organizationId, rows.map((r) => r.supplier_id)),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      amount: str(r.amount),
      tax_amount: str(r.tax_amount),
      total: str(r.total),
      category_name: r.category_id ? (categories.get(r.category_id) ?? null) : null,
      project_name: r.project_id ? (projects.get(r.project_id) ?? null) : null,
      supplier_name: r.supplier_id ? (suppliers.get(r.supplier_id) ?? null) : null,
    })),
    total: count ?? 0,
  };
}

export interface ExpenseSummary {
  /** Spent this month (expense date), per currency, VAT included. */
  month: Record<string, string>;
  /** Still to pay, per currency. */
  unpaid: Record<string, string>;
  unpaidCount: number;
}

export async function getExpenseSummary(supabase: ServerSupabaseClient, organizationId: string, today: string): Promise<ExpenseSummary> {
  const [month, unpaid] = await Promise.all([
    supabase
      .from("expenses")
      .select("total, currency")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("expense_date", monthStart(today))
      .lte("expense_date", today)
      .limit(10000),
    supabase.from("expenses").select("total, currency").eq("organization_id", organizationId).is("deleted_at", null).eq("payment_status", "unpaid").limit(10000),
  ]);
  if (month.error) throw new Error(`Failed to summarize expenses: ${month.error.message}`);
  if (unpaid.error) throw new Error(`Failed to summarize expenses: ${unpaid.error.message}`);
  const out: ExpenseSummary = { month: {}, unpaid: {}, unpaidCount: (unpaid.data ?? []).length };
  for (const r of month.data ?? []) addTo(out.month, r.currency, r.total);
  for (const r of unpaid.data ?? []) addTo(out.unpaid, r.currency, r.total);
  return out;
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  kind: ExpenseKind;
  is_active: boolean;
}

export async function listExpenseCategories(supabase: ServerSupabaseClient, organizationId: string): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, kind, is_active")
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("name")
    .limit(500);
  if (error) throw new Error(`Failed to list expense categories: ${error.message}`);
  return data ?? [];
}

/** Suppliers for the expense form (archived ones excluded). */
export async function listSupplierOptions(supabase: ServerSupabaseClient, organizationId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("suppliers").select("id, name").eq("organization_id", organizationId).is("deleted_at", null).order("name").limit(500);
  if (error) throw new Error(`Failed to list suppliers: ${error.message}`);
  return data ?? [];
}

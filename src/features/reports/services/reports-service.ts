import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { add, compare, sub, toFixed } from "@/lib/calculations/decimal";
import { computePeriodProfit, computeProjectProfitability, type ProjectProfitability } from "@/lib/calculations/profitability";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard-service";
import { getProjectFinancials } from "@/features/projects/services/project-service";
import { EXPENSE_KINDS, type ExpenseKind } from "@/features/finance/schemas/finance";

export const REPORT_PERIODS = [3, 6, 12] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export interface MonthRow {
  month: string;
  revenue: string;
  expenses: string;
  profit: string;
  cash_collected: string;
}

export interface PeriodReport {
  currency: string;
  /** First day of the first month in the period. */
  from: string;
  today: string;
  months: MonthRow[];
  totals: { revenue: string; expenses: string; profit: string; marginPercent: string | null; cash_collected: string };
}

/**
 * Revenue (net value of issued invoices), expenses (net of VAT) and cash
 * collected per month, in the organization currency, all from
 * dashboard_summary so the report and the dashboard always agree.
 */
export async function getPeriodReport(supabase: ServerSupabaseClient, organizationId: string, months: ReportPeriod): Promise<PeriodReport> {
  const summary = await getDashboardSummary(supabase, organizationId, months);
  const rows = summary.monthly.map((m) => ({ ...m, revenue: toFixed(m.revenue), expenses: toFixed(m.expenses), cash_collected: toFixed(m.cash_collected), profit: toFixed(sub(m.revenue, m.expenses)) }));
  const revenue = toFixed(rows.reduce((acc, r) => add(acc, r.revenue), add(0, 0)));
  const expenses = toFixed(rows.reduce((acc, r) => add(acc, r.expenses), add(0, 0)));
  const cash = toFixed(rows.reduce((acc, r) => add(acc, r.cash_collected), add(0, 0)));
  const { profit, marginPercent } = computePeriodProfit(revenue, expenses);
  return {
    currency: summary.currency,
    from: `${rows[0]?.month ?? summary.month_start.slice(0, 7)}-01`,
    today: summary.today,
    months: rows,
    totals: { revenue, expenses, profit, marginPercent, cash_collected: cash },
  };
}

/** Expenses of the period by cost type (net of VAT, organization currency), largest first. */
export async function getExpenseBreakdown(
  supabase: ServerSupabaseClient,
  organizationId: string,
  { from, to, currency }: { from: string; to: string; currency: string },
): Promise<{ kind: ExpenseKind; amount: string }[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("kind, amount")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("currency", currency)
    .gte("expense_date", from)
    .lte("expense_date", to)
    .limit(20000);
  if (error) throw new Error(`Failed to load expenses: ${error.message}`);
  const totals = new Map<ExpenseKind, string>();
  for (const row of data ?? []) totals.set(row.kind, toFixed(add(totals.get(row.kind) ?? "0", row.amount ?? 0)));
  return EXPENSE_KINDS.filter((k) => totals.has(k) && compare(totals.get(k)!, "0") > 0)
    .map((kind) => ({ kind, amount: totals.get(kind)! }))
    .sort((a, b) => compare(b.amount, a.amount));
}

/** Customers by net invoiced value in the period (organization currency). */
export async function getTopCustomers(
  supabase: ServerSupabaseClient,
  organizationId: string,
  { from, to, currency, limit = 5 }: { from: string; to: string; currency: string; limit?: number },
): Promise<{ id: string; name: string; revenue: string; invoices: number }[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("customer_id, subtotal, discount_total")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("status", ["issued", "partially_paid", "paid"])
    .eq("currency", currency)
    .gte("issue_date", from)
    .lte("issue_date", to)
    .limit(20000);
  if (error) throw new Error(`Failed to load invoices: ${error.message}`);
  const byCustomer = new Map<string, { revenue: string; invoices: number }>();
  for (const row of data ?? []) {
    const entry = byCustomer.get(row.customer_id) ?? { revenue: "0", invoices: 0 };
    entry.revenue = toFixed(add(entry.revenue, sub(row.subtotal ?? 0, row.discount_total ?? 0)));
    entry.invoices += 1;
    byCustomer.set(row.customer_id, entry);
  }
  const top = [...byCustomer.entries()].sort(([, a], [, b]) => compare(b.revenue, a.revenue)).slice(0, limit);
  if (top.length === 0) return [];
  const names = await supabase.from("customers").select("id, name").eq("organization_id", organizationId).in("id", top.map(([id]) => id));
  if (names.error) throw new Error(`Failed to load customers: ${names.error.message}`);
  const nameOf = new Map((names.data ?? []).map((c) => [c.id, c.name]));
  return top.map(([id, v]) => ({ id, name: nameOf.get(id) ?? "—", ...v }));
}

export interface ProjectProfitRow extends ProjectProfitability {
  id: string;
  name: string;
  status: string;
}

/**
 * Profitability of the most recently updated active, on-hold and completed
 * projects (each in its own currency), most profitable first.
 */
export async function getProjectProfitReport(supabase: ServerSupabaseClient, organizationId: string, limit = 25): Promise<ProjectProfitRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("status", ["active", "on_hold", "completed"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  const rows = await Promise.all(
    (data ?? []).map(async (p) => {
      const financials = await getProjectFinancials(supabase, organizationId, p.id);
      return financials ? ({ id: p.id, name: p.name, status: p.status as string, ...computeProjectProfitability(financials) } satisfies ProjectProfitRow) : null;
    }),
  );
  return rows
    .filter((r): r is ProjectProfitRow => r !== null)
    .filter((r) => compare(r.revenue, "0") !== 0 || compare(r.directCosts, "0") !== 0)
    .sort((a, b) => compare(b.grossProfit, a.grossProfit));
}

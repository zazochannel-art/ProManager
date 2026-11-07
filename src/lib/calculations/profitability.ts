import { add, dec, div, isZero, mul, round, sub, sum, toFixed, type DecimalInput } from "./decimal";

/** Raw aggregates as returned by public.project_financials(). */
export interface ProjectFinancialAggregates {
  currency: string;
  budget: DecimalInput | null;
  revenue: DecimalInput;
  cash_collected: DecimalInput;
  material_costs: DecimalInput;
  labor_expenses: DecimalInput;
  labor_time_cost: DecimalInput;
  other_costs: DecimalInput;
  excluded_foreign_currency_items: number;
}

export interface ProjectProfitability {
  currency: string;
  /** Recognized revenue: net value of issued invoices. */
  revenue: string;
  /** Cash actually received against the project's invoices. */
  cashCollected: string;
  /** Invoiced but not yet collected. */
  receivable: string;
  materialCosts: string;
  laborCosts: string;
  otherCosts: string;
  directCosts: string;
  grossProfit: string;
  /** Percentage with 2 decimals, or null when there is no revenue yet. */
  marginPercent: string | null;
  /** Net cash position: cash collected − direct costs. */
  cashFlow: string;
  budgetUsedPercent: string | null;
  excludedForeignCurrencyItems: number;
}

export function computeProjectProfitability(a: ProjectFinancialAggregates): ProjectProfitability {
  const revenue = dec(a.revenue);
  const cash = dec(a.cash_collected);
  const material = dec(a.material_costs);
  const labor = add(a.labor_expenses, a.labor_time_cost);
  const other = dec(a.other_costs);
  const direct = sum([material, labor, other]);
  const profit = sub(revenue, direct);
  const margin = isZero(revenue) ? null : toFixed(round(mul(div(profit, revenue), 100), 2));
  const budgetUsed =
    a.budget === null || isZero(a.budget) ? null : toFixed(round(mul(div(direct, a.budget), 100), 2));

  return {
    currency: a.currency,
    revenue: toFixed(revenue),
    cashCollected: toFixed(cash),
    receivable: toFixed(sub(revenue, cash)),
    materialCosts: toFixed(material),
    laborCosts: toFixed(labor),
    otherCosts: toFixed(other),
    directCosts: toFixed(direct),
    grossProfit: toFixed(profit),
    marginPercent: margin,
    cashFlow: toFixed(sub(cash, direct)),
    budgetUsedPercent: budgetUsed,
    excludedForeignCurrencyItems: a.excluded_foreign_currency_items,
  };
}

/** Profit and margin for a period (dashboard). */
export function computePeriodProfit(revenue: DecimalInput, expenses: DecimalInput) {
  const profit = sub(revenue, expenses);
  return {
    profit: toFixed(profit),
    marginPercent: isZero(revenue) ? null : toFixed(round(mul(div(profit, revenue), 100), 2)),
  };
}

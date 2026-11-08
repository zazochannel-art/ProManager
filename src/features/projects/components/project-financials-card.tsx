import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Dictionary } from "@/lib/i18n";
import { interpolate } from "@/lib/i18n";
import type { Locale } from "@/config/site";
import { computeProjectProfitability } from "@/lib/calculations/profitability";
import { isNegative } from "@/lib/calculations/decimal";
import { formatMoney, formatPercent } from "@/lib/currency/format";
import { cn } from "@/lib/utils/cn";
import type { ProjectFinancials } from "../services/project-service";

/** Server component: every figure comes from public.project_financials (exact decimals). */
export function ProjectFinancialsCard({ financials, t, locale }: { financials: ProjectFinancials; t: Dictionary; locale: Locale }) {
  const p = computeProjectProfitability(financials);
  const money = (v: string) => formatMoney(v, p.currency, locale);
  const rows: { label: string; value: string; strong?: boolean; negative?: boolean }[] = [
    { label: t.projects.financials.revenue, value: money(p.revenue), strong: true },
    { label: t.projects.financials.cashCollected, value: money(p.cashCollected) },
    { label: t.projects.financials.receivable, value: money(p.receivable) },
    { label: t.projects.financials.materialCosts, value: money(p.materialCosts) },
    { label: t.projects.financials.laborCosts, value: money(p.laborCosts) },
    { label: t.projects.financials.otherCosts, value: money(p.otherCosts) },
    { label: t.projects.financials.directCosts, value: money(p.directCosts), strong: true },
    { label: t.projects.financials.grossProfit, value: money(p.grossProfit), strong: true, negative: isNegative(p.grossProfit) },
  ];
  if (p.marginPercent !== null) rows.push({ label: t.projects.financials.margin, value: formatPercent(p.marginPercent, locale), negative: isNegative(p.marginPercent) });
  if (p.budgetUsedPercent !== null) rows.push({ label: t.projects.financials.budgetUsed, value: formatPercent(p.budgetUsedPercent, locale) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.projects.financials.title}</CardTitle>
        <CardDescription>{t.projects.financials.hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className={cn("flex items-baseline justify-between gap-3", row.strong && "border-t border-border pt-2 first:border-t-0 first:pt-0")}>
              <dt className={row.strong ? "font-medium" : "text-muted-foreground"}>{row.label}</dt>
              <dd className={cn("tabular-nums", row.strong && "font-semibold", row.negative && "text-danger")}>{row.value}</dd>
            </div>
          ))}
        </dl>
        {p.excludedForeignCurrencyItems > 0 ? (
          <p className="mt-3 text-xs text-warning">{interpolate(t.projects.financials.excluded, { count: p.excludedForeignCurrencyItems })}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

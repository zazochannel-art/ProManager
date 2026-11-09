import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterGroup } from "@/components/shared/filter-group";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RevenueExpensesChart } from "@/components/charts/revenue-expenses-chart";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency/format";
import { formatMonth } from "@/lib/utils/dates";
import { isZero, sum, toNumberForDisplay } from "@/lib/calculations/decimal";
import { PROJECT_STATUS_VARIANT, PROJECT_STATUSES, type ProjectStatus } from "@/features/projects/schemas/project";
import { REPORT_PERIODS, getExpenseBreakdown, getPeriodReport, getProjectProfitReport, getTopCustomers, type ReportPeriod } from "@/features/reports/services/reports-service";

export const metadata: Metadata = { title: "Reports" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isPeriod = (v: number): v is ReportPeriod => (REPORT_PERIODS as readonly number[]).includes(v);
const isProjectStatus = (v: string): v is ProjectStatus => (PROJECT_STATUSES as readonly string[]).includes(v);

/**
 * Financial reports for a period of 3, 6 or 12 months. Every figure comes
 * from the database (dashboard_summary, project_financials, RLS-filtered
 * queries); the page only arranges them.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/dashboard/reports">) {
  const ctx = await requirePagePermission("reports.read");
  const { t, locale } = await getI18n();
  const requested = Number(single((await searchParams).months));
  const months: ReportPeriod = isPeriod(requested) ? requested : 6;
  const supabase = await createClient();

  const report = await getPeriodReport(supabase, ctx.organization.id, months);
  const range = { from: report.from, to: report.today, currency: report.currency };
  const [breakdown, customers, projects] = await Promise.all([
    ctx.can("expenses.read") ? getExpenseBreakdown(supabase, ctx.organization.id, range) : Promise.resolve([]),
    ctx.can("invoices.read") ? getTopCustomers(supabase, ctx.organization.id, range) : Promise.resolve([]),
    getProjectProfitReport(supabase, ctx.organization.id),
  ]);

  const money = (v: string, currency = report.currency) => formatMoney(v, currency, locale);
  const totals = report.totals;
  const chartData = report.months.map((m) => ({ label: formatMonth(m.month, locale), revenue: toNumberForDisplay(m.revenue), expenses: toNumberForDisplay(m.expenses) }));
  const hasData = !isZero(sum(report.months.flatMap((m) => [m.revenue, m.expenses, m.cash_collected])));
  const maxExpense = Math.max(...breakdown.map((b) => toNumberForDisplay(b.amount)), 1);
  const negative = (v: string) => v.startsWith("-");

  return (
    <>
      <PageHeader title={t.reports.title} description={interpolate(t.reports.description, { currency: report.currency })} />
      <div className="mb-6">
        <FilterGroup
          label={t.reports.period}
          items={REPORT_PERIODS.map((p) => ({ key: String(p), label: interpolate(t.reports.lastMonths, { count: p }), href: p === 6 ? "/dashboard/reports" : `/dashboard/reports?months=${p}`, active: p === months }))}
        />
      </div>

      <section aria-label={t.reports.summary} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t.dashboard.revenue} value={money(totals.revenue)} hint={t.reports.revenueHint} icon={TrendingUp} tone="primary" />
        <StatCard label={t.dashboard.expenses} value={money(totals.expenses)} hint={t.reports.expensesHint} icon={TrendingDown} tone="warning" />
        <StatCard
          label={t.dashboard.profit}
          value={money(totals.profit)}
          hint={totals.marginPercent ? interpolate(t.dashboard.profitHint, { margin: `${totals.marginPercent}%` }) : t.reports.noRevenue}
          icon={PiggyBank}
          tone={negative(totals.profit) ? "danger" : "success"}
        />
        <StatCard label={t.dashboard.cashCollected} value={money(totals.cash_collected)} hint={t.reports.cashHint} icon={Banknote} tone="neutral" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>{t.reports.monthly}</CardTitle>
            <CardDescription>{t.reports.monthlyBody}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {hasData ? (
              <RevenueExpensesChart data={chartData} currency={report.currency} locale={locale} labels={{ revenue: t.dashboard.revenue, expenses: t.dashboard.expenses, chart: t.reports.monthly }} />
            ) : (
              <p className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">{t.dashboard.chartEmpty}</p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="whitespace-nowrap">
                  <TableRow>
                    <TableHead>{t.reports.month}</TableHead>
                    <TableHead className="text-right">{t.dashboard.revenue}</TableHead>
                    <TableHead className="text-right">{t.dashboard.expenses}</TableHead>
                    <TableHead className="text-right">{t.dashboard.profit}</TableHead>
                    <TableHead className="text-right">{t.dashboard.cashCollected}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...report.months].reverse().map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="whitespace-nowrap capitalize">{formatMonth(m.month, locale)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(m.revenue)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(m.expenses)}</TableCell>
                      <TableCell className={negative(m.profit) ? "text-right font-medium whitespace-nowrap tabular-nums text-danger" : "text-right font-medium whitespace-nowrap tabular-nums"}>{money(m.profit)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(m.cash_collected)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          {ctx.can("expenses.read") ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.reports.expensesByKind}</CardTitle>
                <CardDescription>{t.reports.expensesByKindBody}</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.reports.noExpenses}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {breakdown.map((b) => (
                      <li key={b.kind}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span>{t.expenses.kinds[b.kind]}</span>
                          <span className="font-medium tabular-nums">{money(b.amount)}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, (toNumberForDisplay(b.amount) / maxExpense) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
          {ctx.can("invoices.read") ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.reports.topCustomers}</CardTitle>
                <CardDescription>{t.reports.topCustomersBody}</CardDescription>
              </CardHeader>
              <CardContent>
                {customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.reports.noInvoices}</p>
                ) : (
                  <ol className="flex flex-col divide-y divide-border">
                    {customers.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/dashboard/customers/${c.id}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                            {c.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">{interpolate(t.reports.invoiceCount, { count: c.invoices })}</span>
                        </span>
                        <span className="text-sm font-medium whitespace-nowrap tabular-nums">{money(c.revenue)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.reports.projects}</CardTitle>
          <CardDescription>{t.reports.projectsBody}</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.reports.noProjects}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="whitespace-nowrap">
                  <TableRow>
                    <TableHead>{t.invoicing.project}</TableHead>
                    <TableHead className="text-right">{t.dashboard.revenue}</TableHead>
                    <TableHead className="text-right">{t.reports.directCosts}</TableHead>
                    <TableHead className="text-right">{t.dashboard.profit}</TableHead>
                    <TableHead className="text-right">{t.reports.margin}</TableHead>
                    <TableHead className="text-right">{t.reports.receivable}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <Link href={`/dashboard/projects/${p.id}`} className="font-medium hover:text-primary hover:underline">
                            {p.name}
                          </Link>
                          {isProjectStatus(p.status) ? <Badge variant={PROJECT_STATUS_VARIANT[p.status]}>{t.projects.statuses[p.status]}</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(p.revenue, p.currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(p.directCosts, p.currency)}</TableCell>
                      <TableCell className={negative(p.grossProfit) ? "text-right font-medium whitespace-nowrap tabular-nums text-danger" : "text-right font-medium whitespace-nowrap tabular-nums text-success"}>
                        {money(p.grossProfit, p.currency)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{p.marginPercent ? `${p.marginPercent}%` : "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(p.receivable, p.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t.reports.projectsNote}</p>
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Briefcase, CheckCircle2, Clock, Coins, PiggyBank, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RevenueExpensesChart } from "@/components/charts/revenue-expenses-chart";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { formatMoney, formatNumber } from "@/lib/currency/format";
import { formatDate, formatDateTime, formatMonth } from "@/lib/utils/dates";
import { computePeriodProfit } from "@/lib/calculations/profitability";
import { isNegative, isZero, sum, toNumberForDisplay } from "@/lib/calculations/decimal";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard-service";
import type { Locale } from "@/config/site";
import type { Dictionary } from "@/lib/i18n";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireOrganizationContext();
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const summary = await getDashboardSummary(supabase, ctx.organization.id, 6);
  const showFinancials = ctx.can("dashboard.financials");
  const currency = summary.currency;
  const money = (v: string) => formatMoney(v, currency, locale);
  const { profit, marginPercent } = computePeriodProfit(summary.revenue_month, summary.expenses_month);

  const chartData = summary.monthly.map((m) => ({
    label: formatMonth(m.month, locale),
    revenue: toNumberForDisplay(m.revenue),
    expenses: toNumberForDisplay(m.expenses),
  }));
  const chartHasData = !isZero(sum(summary.monthly.flatMap((m) => [m.revenue, m.expenses])));
  const firstName = (ctx.profile.full_name ?? "").split(" ")[0] || ctx.profile.email;

  return (
    <>
      <PageHeader
        title={interpolate(t.dashboard.greeting, { name: firstName })}
        description={interpolate(t.dashboard.subtitle, { organization: ctx.organization.name })}
      />

      {showFinancials ? (
        <section aria-label={t.dashboard.title} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t.dashboard.revenue} value={money(summary.revenue_month)} hint={t.dashboard.revenueHint} icon={TrendingUp} tone="primary" />
          <StatCard label={t.dashboard.expenses} value={money(summary.expenses_month)} hint={t.dashboard.expensesHint} icon={Wallet} tone="warning" />
          <StatCard
            label={t.dashboard.profit}
            value={money(profit)}
            hint={marginPercent === null ? t.dashboard.profitHintEmpty : interpolate(t.dashboard.profitHint, { margin: `${formatNumber(marginPercent, locale, 1)} %` })}
            icon={PiggyBank}
            tone={isNegative(profit) ? "danger" : "success"}
          />
          <StatCard label={t.dashboard.cashCollected} value={money(summary.cash_collected_month)} hint={t.dashboard.cashCollectedHint} icon={Coins} tone="success" />
          <StatCard label={t.dashboard.activeProjects} value={String(summary.active_projects)} icon={Briefcase} />
          <StatCard label={t.dashboard.completedProjects} value={String(summary.completed_projects)} icon={CheckCircle2} tone="success" />
          <StatCard
            label={t.dashboard.pendingInvoices}
            value={money(summary.pending_invoices.amount)}
            hint={interpolate(t.dashboard.pendingInvoicesHint, { count: summary.pending_invoices.count, amount: money(summary.pending_invoices.amount) })}
            icon={Receipt}
          />
          <StatCard
            label={t.dashboard.overduePayments}
            value={money(summary.overdue_invoices.amount)}
            hint={interpolate(t.dashboard.overduePaymentsHint, { count: summary.overdue_invoices.count })}
            icon={AlertTriangle}
            tone={summary.overdue_invoices.count > 0 ? "danger" : "neutral"}
          />
        </section>
      ) : (
        <section aria-label={t.dashboard.title} className="grid gap-4 sm:grid-cols-2">
          <StatCard label={t.dashboard.activeProjects} value={String(summary.active_projects)} icon={Briefcase} />
          <StatCard label={t.dashboard.completedProjects} value={String(summary.completed_projects)} icon={CheckCircle2} tone="success" />
          <p className="text-sm text-muted-foreground sm:col-span-2">{t.dashboard.financialsHidden}</p>
        </section>
      )}

      {showFinancials && summary.other_currency_documents_month > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{interpolate(t.dashboard.otherCurrencyNote, { count: summary.other_currency_documents_month })}</p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {showFinancials ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>{t.dashboard.chartTitle}</CardTitle>
              <CardDescription>{interpolate(t.dashboard.chartSubtitle, { currency })}</CardDescription>
            </CardHeader>
            <CardContent>
              {chartHasData ? (
                <RevenueExpensesChart
                  data={chartData}
                  currency={currency}
                  locale={locale}
                  labels={{ revenue: t.dashboard.revenue, expenses: t.dashboard.expenses, chart: t.dashboard.chartTitle }}
                />
              ) : (
                <p className="flex h-72 items-center justify-center text-center text-sm text-muted-foreground">{t.dashboard.chartEmpty}</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.upcomingTasks}</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.upcoming_tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.upcomingTasksEmpty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {summary.upcoming_tasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" aria-hidden="true" />
                        {task.due_at ? interpolate(t.tasks.due, { date: formatDate(task.due_at, locale) }) : t.tasks.noDueDate}
                        {task.project_name ? ` · ${task.project_name}` : ""}
                      </p>
                    </div>
                    <Badge variant={task.status === "blocked" ? "danger" : task.status === "in_progress" ? "primary" : "neutral"}>
                      {labelOf(t.tasks.statuses, task.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.recentCustomers}</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.recent_customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.recentCustomersEmpty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {summary.recent_customers.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      {c.email ? <p className="truncate text-xs text-muted-foreground">{c.email}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(c.created_at, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
            {ctx.can("customers.read") ? (
              <Link href="/dashboard/customers" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                {t.common.viewAll}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card className={showFinancials ? "xl:col-span-2" : "xl:col-span-1"}>
          <CardHeader>
            <CardTitle>{t.dashboard.recentActivity}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityList items={summary.recent_activity} locale={locale} timeZone={ctx.settings.timezone} t={t} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function labelOf(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

function ActivityList({
  items,
  locale,
  timeZone,
  t,
}: {
  items: { id: string; entity_type: string; action: string; summary: string | null; created_at: string; actor_name: string | null }[];
  locale: Locale;
  timeZone: string;
  t: Dictionary;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t.dashboard.recentActivityEmpty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <p className="min-w-0">
            <span className="font-medium">{a.actor_name ?? t.activity.system}</span>{" "}
            <span className="text-muted-foreground">
              {labelOf(t.activity.actions, a.action)} {labelOf(t.activity.entities, a.entity_type)}
            </span>
            {a.summary ? <span className="text-foreground"> · {a.summary}</span> : null}
          </p>
          <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.created_at}>
            {formatDateTime(a.created_at, locale, timeZone)}
          </time>
        </li>
      ))}
    </ul>
  );
}

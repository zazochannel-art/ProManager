import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CalendarRange, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterGroup } from "@/components/shared/filter-group";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatCard } from "@/components/shared/stat-card";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency/format";
import { formatAmountsByCurrency } from "@/lib/currency/amounts";
import { parsePageParam } from "@/lib/utils/search-params";
import { todayInTimeZone } from "@/lib/utils/dates";
import { FINANCE_PAGE_SIZE, PAYMENT_VIEWS, getPaymentSummary, listPayments, type PaymentView } from "@/features/finance/services/finance-service";
import { PaymentsTable } from "@/features/finance/components/payments-table";

export const metadata: Metadata = { title: "Payments" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isView = (v: string | undefined): v is PaymentView => (PAYMENT_VIEWS as readonly (string | undefined)[]).includes(v);

/**
 * Every payment received from customers. Payments are recorded from an issued
 * invoice (record_payment allocates them); here they can be reviewed and voided.
 */
export default async function PaymentsPage({ searchParams }: PageProps<"/dashboard/payments">) {
  const ctx = await requirePagePermission("payments.read");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const rawView = single(params.view);
  const view: PaymentView = isView(rawView) ? rawView : "all";
  const page = parsePageParam(params.page);
  const today = todayInTimeZone(ctx.settings.timezone);
  const supabase = await createClient();

  const [{ rows, total }, summary] = await Promise.all([listPayments(supabase, ctx.organization.id, { view, page, today }), getPaymentSummary(supabase, ctx.organization.id, today)]);
  const pageCount = Math.max(1, Math.ceil(total / FINANCE_PAGE_SIZE));
  const href = (next: { view?: PaymentView; page?: number }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v !== "all") q.set("view", v);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return s ? `/dashboard/payments?${s}` : "/dashboard/payments";
  };
  const zero = formatMoney("0", ctx.currency, locale);
  const toInvoices = ctx.can("invoices.read") ? (
    <Button asChild variant="secondary">
      <Link href="/dashboard/invoices?view=open">
        <Receipt aria-hidden="true" />
        {t.payments.openInvoices}
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title={t.payments.title} description={t.payments.description} actions={toInvoices} />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        <StatCard
          label={t.payments.stats.month}
          value={formatAmountsByCurrency(summary.month, ctx.currency, locale) ?? zero}
          hint={interpolate(t.payments.stats.monthCount, { count: summary.monthCount })}
          icon={Banknote}
          tone="success"
        />
        <StatCard label={t.payments.stats.year} value={formatAmountsByCurrency(summary.year, ctx.currency, locale) ?? zero} icon={CalendarRange} tone="primary" />
      </div>
      <div className="mb-4">
        <FilterGroup label={t.payments.filter} items={PAYMENT_VIEWS.map((v) => ({ key: v, label: t.payments.views[v], href: href({ view: v }), active: v === view }))} />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={Banknote}
          title={view === "all" ? t.payments.empty : t.payments.emptyFiltered}
          description={view === "all" ? t.payments.emptyBody : undefined}
          action={view === "all" ? toInvoices : null}
        />
      ) : (
        <>
          <PaymentsTable rows={rows} canWrite={ctx.can("payments.write")} />
          <Pagination
            page={page}
            pageCount={pageCount}
            hrefForPage={(p) => href({ page: p })}
            labels={{ previous: t.common.previous, next: t.common.next, nav: t.common.pagination, page: interpolate(t.common.page, { page, total: pageCount }) }}
          />
        </>
      )}
    </>
  );
}

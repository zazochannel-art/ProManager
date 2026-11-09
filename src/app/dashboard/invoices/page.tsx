import type { Metadata } from "next";
import { AlarmClock, FilePen, Receipt, Wallet } from "lucide-react";
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
import { parsePageParam } from "@/lib/utils/search-params";
import { todayInTimeZone } from "@/lib/utils/dates";
import type { Locale } from "@/config/site";
import { listCustomerOptions } from "@/features/customers/services/customer-service";
import {
  DOCUMENTS_PAGE_SIZE,
  INVOICE_VIEWS,
  getInvoiceSummary,
  listInvoices,
  listProjectPickerOptions,
  type InvoiceView,
} from "@/features/invoicing/services/invoicing-service";
import { InvoicesTable } from "@/features/invoicing/components/documents-tables";
import { DocumentHeaderDialog } from "@/features/invoicing/components/document-header-dialog";

export const metadata: Metadata = { title: "Invoices" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isView = (v: string | undefined): v is InvoiceView => (INVOICE_VIEWS as readonly (string | undefined)[]).includes(v);

/** "1 200,00 MDL · 300,00 EUR" with the organization currency first. */
function amounts(byCurrency: Record<string, string>, first: string, locale: Locale): string | null {
  const entries = Object.entries(byCurrency).filter(([, v]) => Number(v) !== 0);
  if (entries.length === 0) return null;
  entries.sort(([a], [b]) => (a === first ? -1 : b === first ? 1 : a.localeCompare(b)));
  return entries.map(([c, v]) => formatMoney(v, c, locale)).join(" · ");
}

export default async function InvoicesPage({ searchParams }: PageProps<"/dashboard/invoices">) {
  const ctx = await requirePagePermission("invoices.read");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const rawView = single(params.view);
  const view: InvoiceView = isView(rawView) ? rawView : "all";
  const page = parsePageParam(params.page);
  const supabase = await createClient();
  const canWrite = ctx.can("invoices.write");

  const [{ rows, total }, summary, customers, projects] = await Promise.all([
    listInvoices(supabase, ctx.organization.id, { view, page }),
    getInvoiceSummary(supabase, ctx.organization.id),
    canWrite && ctx.can("customers.read") ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite && ctx.can("projects.read") ? listProjectPickerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE));
  const href = (next: { view?: InvoiceView; page?: number }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v !== "all") q.set("view", v);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return s ? `/dashboard/invoices?${s}` : "/dashboard/invoices";
  };
  const createButton = canWrite ? (
    <DocumentHeaderDialog
      kind="invoice"
      options={{ customers, projects }}
      initialValues={{ customerId: "", currency: ctx.currency, issueDate: todayInTimeZone(ctx.settings.timezone) }}
    />
  ) : null;
  const outstanding = amounts(summary.outstanding, ctx.currency, locale);
  const overdue = amounts(summary.overdueAmount, ctx.currency, locale);

  return (
    <>
      <PageHeader title={t.invoices.title} description={t.invoices.description} actions={createButton} />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
        <StatCard
          label={t.invoices.stats.outstanding}
          value={outstanding ?? formatMoney("0", ctx.currency, locale)}
          hint={summary.open > 0 ? interpolate(t.invoices.stats.openCount, { count: summary.open }) : t.invoices.stats.nothing}
          icon={Wallet}
          tone="primary"
        />
        <StatCard
          label={t.invoices.stats.overdue}
          value={overdue ?? formatMoney("0", ctx.currency, locale)}
          hint={summary.overdue > 0 ? interpolate(t.invoices.stats.overdueCount, { count: summary.overdue }) : undefined}
          icon={AlarmClock}
          tone={summary.overdue > 0 ? "danger" : "success"}
        />
        <StatCard label={t.invoices.stats.drafts} value={String(summary.drafts)} icon={FilePen} tone="warning" />
      </div>
      <div className="mb-4">
        <FilterGroup label={t.invoices.filter} items={INVOICE_VIEWS.map((v) => ({ key: v, label: t.invoices.views[v], href: href({ view: v }), active: v === view }))} />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={Receipt}
          title={view === "all" ? t.invoices.empty : t.invoices.emptyFiltered}
          description={view === "all" ? t.invoices.emptyBody : undefined}
          action={view === "all" ? createButton : null}
        />
      ) : (
        <>
          <InvoicesTable rows={rows} />
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

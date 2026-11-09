import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterGroup } from "@/components/shared/filter-group";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { parsePageParam } from "@/lib/utils/search-params";
import { todayInTimeZone } from "@/lib/utils/dates";
import { listCustomerOptions } from "@/features/customers/services/customer-service";
import { DOCUMENTS_PAGE_SIZE, ESTIMATE_VIEWS, listEstimates, listProjectPickerOptions, type EstimateView } from "@/features/invoicing/services/invoicing-service";
import { EstimatesTable } from "@/features/invoicing/components/documents-tables";
import { DocumentHeaderDialog } from "@/features/invoicing/components/document-header-dialog";

export const metadata: Metadata = { title: "Estimates" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isView = (v: string | undefined): v is EstimateView => (ESTIMATE_VIEWS as readonly (string | undefined)[]).includes(v);

export default async function EstimatesPage({ searchParams }: PageProps<"/dashboard/estimates">) {
  const ctx = await requirePagePermission("estimates.read");
  const { t } = await getI18n();
  const params = await searchParams;
  const rawView = single(params.view);
  const view: EstimateView = isView(rawView) ? rawView : "all";
  const page = parsePageParam(params.page);
  const supabase = await createClient();
  const canWrite = ctx.can("estimates.write");

  const [{ rows, total }, customers, projects] = await Promise.all([
    listEstimates(supabase, ctx.organization.id, { view, page }),
    canWrite && ctx.can("customers.read") ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite && ctx.can("projects.read") ? listProjectPickerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE));
  const href = (next: { view?: EstimateView; page?: number }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v !== "all") q.set("view", v);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return s ? `/dashboard/estimates?${s}` : "/dashboard/estimates";
  };
  const createButton = canWrite ? (
    <DocumentHeaderDialog
      kind="estimate"
      options={{ customers, projects }}
      initialValues={{ customerId: "", currency: ctx.currency, issueDate: todayInTimeZone(ctx.settings.timezone) }}
    />
  ) : null;

  return (
    <>
      <PageHeader title={t.estimates.title} description={t.estimates.description} actions={createButton} />
      <div className="mb-4">
        <FilterGroup label={t.estimates.filter} items={ESTIMATE_VIEWS.map((v) => ({ key: v, label: t.estimates.views[v], href: href({ view: v }), active: v === view }))} />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={FileText}
          title={view === "all" ? t.estimates.empty : t.estimates.emptyFiltered}
          description={view === "all" ? t.estimates.emptyBody : undefined}
          action={view === "all" ? createButton : null}
        />
      ) : (
        <>
          <EstimatesTable rows={rows} />
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

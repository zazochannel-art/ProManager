import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SearchForm } from "@/components/shared/search-form";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { parsePageParam } from "@/lib/utils/search-params";
import { todayInTimeZone } from "@/lib/utils/dates";
import { SUPPLIERS_PAGE_SIZE, getSupplierSpend, listSuppliers } from "@/features/suppliers/services/supplier-service";
import { SuppliersTable } from "@/features/suppliers/components/suppliers-table";
import { SupplierDialog } from "@/features/suppliers/components/supplier-dialog";

export const metadata: Metadata = { title: "Suppliers" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SuppliersPage({ searchParams }: PageProps<"/dashboard/suppliers">) {
  const ctx = await requirePagePermission("suppliers.read");
  const { t } = await getI18n();
  const params = await searchParams;
  const q = single(params.q)?.trim().slice(0, 100) || undefined;
  const page = parsePageParam(params.page);
  const supabase = await createClient();
  const canWrite = ctx.can("suppliers.write");
  const showSpend = ctx.can("expenses.read");

  const { rows, total } = await listSuppliers(supabase, ctx.organization.id, { page, q });
  // Spend over the current calendar year, from the expenses linked to each supplier.
  const yearStart = `${todayInTimeZone(ctx.settings.timezone).slice(0, 4)}-01-01`;
  const spend = showSpend ? await getSupplierSpend(supabase, ctx.organization.id, rows.map((r) => r.id), yearStart) : {};
  const pageCount = Math.max(1, Math.ceil(total / SUPPLIERS_PAGE_SIZE));
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    const str = s.toString();
    return str ? `/dashboard/suppliers?${str}` : "/dashboard/suppliers";
  };

  return (
    <>
      <PageHeader title={t.suppliers.title} description={t.suppliers.description} actions={canWrite ? <SupplierDialog /> : null} />
      <div className="mb-4">
        <SearchForm action="/dashboard/suppliers" value={q} label={t.suppliers.search} placeholder={t.suppliers.searchPlaceholder} />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={Truck}
          title={q ? t.suppliers.emptyFiltered : t.suppliers.empty}
          description={q ? undefined : t.suppliers.emptyBody}
          action={!q && canWrite ? <SupplierDialog /> : null}
        />
      ) : (
        <>
          <SuppliersTable rows={rows.map((r) => ({ ...r, spend: showSpend ? (spend[r.id] ?? { totals: {}, count: 0 }) : null }))} canWrite={canWrite} showSpend={showSpend} currency={ctx.currency} />
          <Pagination
            page={page}
            pageCount={pageCount}
            hrefForPage={href}
            labels={{ previous: t.common.previous, next: t.common.next, nav: t.common.pagination, page: interpolate(t.common.page, { page, total: pageCount }) }}
          />
        </>
      )}
    </>
  );
}

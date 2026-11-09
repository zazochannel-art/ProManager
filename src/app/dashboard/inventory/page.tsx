import type { Metadata } from "next";
import { AlertTriangle, Boxes, PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterGroup } from "@/components/shared/filter-group";
import { PageHeader } from "@/components/shared/page-header";
import { SearchForm } from "@/components/shared/search-form";
import { StatCard } from "@/components/shared/stat-card";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency/format";
import { formatAmountsByCurrency } from "@/lib/currency/amounts";
import { todayInTimeZone } from "@/lib/utils/dates";
import { INVENTORY_VIEWS, listInventory, type InventoryView } from "@/features/inventory/services/inventory-service";
import { InventoryTable } from "@/features/inventory/components/inventory-table";
import { ItemDialog } from "@/features/inventory/components/item-dialog";
import { listSupplierOptions } from "@/features/finance/services/finance-service";
import { listProjectPickerOptions } from "@/features/invoicing/services/invoicing-service";

export const metadata: Metadata = { title: "Inventory" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isView = (v: string | undefined): v is InventoryView => (INVENTORY_VIEWS as readonly (string | undefined)[]).includes(v);

export default async function InventoryPage({ searchParams }: PageProps<"/dashboard/inventory">) {
  const ctx = await requirePagePermission("inventory.read");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const rawView = single(params.view);
  const view: InventoryView = isView(rawView) ? rawView : "all";
  const q = single(params.q)?.trim().slice(0, 100) || undefined;
  const supabase = await createClient();
  const canWrite = ctx.can("inventory.write");

  const [{ rows, summary, truncated }, suppliers, projects] = await Promise.all([
    listInventory(supabase, ctx.organization.id, { q, view }),
    canWrite && ctx.can("suppliers.read") ? listSupplierOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite && ctx.can("projects.read") ? listProjectPickerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
  ]);
  const href = (v: InventoryView) => {
    const s = new URLSearchParams();
    if (v !== "all") s.set("view", v);
    if (q) s.set("q", q);
    const str = s.toString();
    return str ? `/dashboard/inventory?${str}` : "/dashboard/inventory";
  };
  const createButton = canWrite ? (
    <ItemDialog suppliers={suppliers} initialValues={{ name: "", sku: "", unit: "buc", description: "", unitCost: "", salePrice: "", currency: ctx.currency, reorderLevel: "", supplierId: "none" }} />
  ) : null;
  const filtered = view !== "all" || Boolean(q);

  return (
    <>
      <PageHeader title={t.inventory.title} description={t.inventory.description} actions={createButton} />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
        <StatCard label={t.inventory.stats.items} value={String(summary.items)} icon={Boxes} tone="primary" />
        <StatCard label={t.inventory.stats.value} value={formatAmountsByCurrency(summary.value, ctx.currency, locale) ?? formatMoney("0", ctx.currency, locale)} icon={PackageCheck} tone="success" />
        <StatCard
          label={t.inventory.stats.low}
          value={String(summary.low)}
          hint={summary.low > 0 ? t.inventory.stats.lowHint : t.inventory.stats.lowNone}
          icon={AlertTriangle}
          tone={summary.low > 0 ? "warning" : "neutral"}
        />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterGroup label={t.inventory.filter} items={INVENTORY_VIEWS.map((v) => ({ key: v, label: t.inventory.views[v], href: href(v), active: v === view }))} />
        <SearchForm action="/dashboard/inventory" value={q} keep={{ view: view === "all" ? undefined : view }} label={t.inventory.search} placeholder={t.inventory.searchPlaceholder} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Boxes} title={filtered ? t.inventory.emptyFiltered : t.inventory.empty} description={filtered ? undefined : t.inventory.emptyBody} action={filtered ? null : createButton} />
      ) : (
        <>
          <InventoryTable rows={rows} canWrite={canWrite} suppliers={suppliers} projects={projects} today={todayInTimeZone(ctx.settings.timezone)} orgCurrency={ctx.currency} />
          {truncated ? <p className="mt-3 text-sm text-muted-foreground">{interpolate(t.inventory.truncated, { count: 2000 })}</p> : null}
        </>
      )}
    </>
  );
}

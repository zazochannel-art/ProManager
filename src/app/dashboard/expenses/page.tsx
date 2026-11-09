import type { Metadata } from "next";
import { CalendarClock, HandCoins, Wallet } from "lucide-react";
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
import { listProjectPickerOptions } from "@/features/invoicing/services/invoicing-service";
import {
  EXPENSE_VIEWS,
  FINANCE_PAGE_SIZE,
  getExpenseSummary,
  listExpenseCategories,
  listExpenses,
  listSupplierOptions,
  type ExpenseView,
} from "@/features/finance/services/finance-service";
import { EXPENSE_KINDS, isExpenseKind, type ExpenseKind } from "@/features/finance/schemas/finance";
import { ExpenseDialog } from "@/features/finance/components/expense-dialog";
import { ExpensesTable } from "@/features/finance/components/expenses-table";
import { ExpenseCategoriesDialog } from "@/features/finance/components/expense-categories-dialog";

export const metadata: Metadata = { title: "Expenses" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isView = (v: string | undefined): v is ExpenseView => (EXPENSE_VIEWS as readonly (string | undefined)[]).includes(v);

export default async function ExpensesPage({ searchParams }: PageProps<"/dashboard/expenses">) {
  const ctx = await requirePagePermission("expenses.read");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const rawView = single(params.view);
  const view: ExpenseView = isView(rawView) ? rawView : "all";
  const rawKind = single(params.kind);
  const kind: ExpenseKind | undefined = isExpenseKind(rawKind) ? rawKind : undefined;
  const page = parsePageParam(params.page);
  const today = todayInTimeZone(ctx.settings.timezone);
  const supabase = await createClient();
  const canWrite = ctx.can("expenses.write");
  const canDelete = ctx.can("expenses.delete");

  const [{ rows, total }, summary, categories, projects, suppliers] = await Promise.all([
    listExpenses(supabase, ctx.organization.id, { view, page, today, kind }),
    getExpenseSummary(supabase, ctx.organization.id, today),
    listExpenseCategories(supabase, ctx.organization.id),
    canWrite && ctx.can("projects.read") ? listProjectPickerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite && ctx.can("suppliers.read") ? listSupplierOptions(supabase, ctx.organization.id) : Promise.resolve([]),
  ]);
  const options = { categories, projects, suppliers };
  const pageCount = Math.max(1, Math.ceil(total / FINANCE_PAGE_SIZE));
  const href = (next: { view?: ExpenseView; kind?: ExpenseKind | null; page?: number }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    const k = next.kind === null ? undefined : (next.kind ?? kind);
    if (v !== "all") q.set("view", v);
    if (k) q.set("kind", k);
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return s ? `/dashboard/expenses?${s}` : "/dashboard/expenses";
  };
  const createButton = canWrite ? (
    <ExpenseDialog
      options={options}
      initialValues={{
        description: "",
        kind: "material",
        categoryId: "none",
        projectId: "none",
        supplierId: "none",
        amount: "",
        taxAmount: "",
        currency: ctx.currency,
        expenseDate: today,
        paymentStatus: "paid",
        paidOn: "",
        reference: "",
      }}
    />
  ) : null;
  const zero = formatMoney("0", ctx.currency, locale);
  const filtered = view !== "all" || Boolean(kind);

  return (
    <>
      <PageHeader
        title={t.expenses.title}
        description={t.expenses.description}
        actions={
          canWrite ? (
            <>
              <ExpenseCategoriesDialog categories={categories} canDelete={canDelete} />
              {createButton}
            </>
          ) : null
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        <StatCard label={t.expenses.stats.month} value={formatAmountsByCurrency(summary.month, ctx.currency, locale) ?? zero} icon={Wallet} tone="primary" />
        <StatCard
          label={t.expenses.stats.unpaid}
          value={formatAmountsByCurrency(summary.unpaid, ctx.currency, locale) ?? zero}
          hint={summary.unpaidCount > 0 ? interpolate(t.expenses.stats.unpaidCount, { count: summary.unpaidCount }) : t.expenses.stats.nothing}
          icon={summary.unpaidCount > 0 ? CalendarClock : HandCoins}
          tone={summary.unpaidCount > 0 ? "warning" : "success"}
        />
      </div>
      <div className="mb-4 flex flex-col gap-3">
        <FilterGroup label={t.expenses.filter} items={EXPENSE_VIEWS.map((v) => ({ key: v, label: t.expenses.views[v], href: href({ view: v, page: 1 }), active: v === view }))} />
        <FilterGroup
          label={t.expenses.kindFilter}
          items={[
            { key: "any", label: t.expenses.allKinds, href: href({ kind: null, page: 1 }), active: !kind },
            ...EXPENSE_KINDS.map((k) => ({ key: k, label: t.expenses.kinds[k], href: href({ kind: k, page: 1 }), active: k === kind })),
          ]}
        />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filtered ? t.expenses.emptyFiltered : t.expenses.empty}
          description={filtered ? undefined : t.expenses.emptyBody}
          action={filtered ? null : createButton}
        />
      ) : (
        <>
          <ExpensesTable rows={rows} options={options} canWrite={canWrite} canDelete={canDelete} today={today} />
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

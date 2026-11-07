import type { Metadata } from "next";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { parsePageParam } from "@/lib/utils/search-params";
import { CUSTOMERS_PAGE_SIZE, listCustomers } from "@/features/customers/services/customer-service";
import { CustomersTable } from "@/features/customers/components/customers-table";
import { CreateCustomerDialog } from "@/features/customers/components/create-customer-dialog";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  const ctx = await requirePagePermission("customers.read");
  const { t } = await getI18n();
  const page = parsePageParam((await searchParams).page);
  const supabase = await createClient();
  const { rows, total } = await listCustomers(supabase, ctx.organization.id, { page });
  const pageCount = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE));
  const canWrite = ctx.can("customers.write");

  return (
    <>
      <PageHeader title={t.customers.title} description={t.customers.description} actions={canWrite ? <CreateCustomerDialog /> : null} />
      {total === 0 ? (
        <EmptyState icon={Users} title={t.customers.empty} description={t.customers.emptyBody} action={canWrite ? <CreateCustomerDialog /> : null} />
      ) : (
        <>
          <CustomersTable rows={rows} />
          <Pagination
            page={page}
            pageCount={pageCount}
            hrefForPage={(p) => `/dashboard/customers?page=${p}`}
            labels={{ previous: t.common.previous, next: t.common.next, nav: t.common.pagination, page: interpolate(t.common.page, { page, total: pageCount }) }}
          />
        </>
      )}
    </>
  );
}

"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";

export interface CustomerRow {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  created_at: string;
}

const helper = createColumnHelper<typeof dataTableFeatures, CustomerRow>();

export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  const { t, locale } = useI18n();
  const columns = useMemo(
    () =>
      [
        helper.accessor("name", { header: t.customers.name, sortFn: "text", cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
        helper.accessor("type", {
          header: t.customers.type,
          enableSorting: false,
          cell: (info) => <Badge variant="outline">{info.getValue() === "individual" ? t.customers.types.individual : t.customers.types.company}</Badge>,
        }),
        helper.accessor("email", { header: t.customers.email, enableSorting: false, cell: (info) => info.getValue() ?? "—" }),
        helper.accessor("phone", { header: t.customers.phone, enableSorting: false, cell: (info) => info.getValue() ?? "—" }),
        helper.accessor("tax_id", { header: t.customers.taxId, enableSorting: false, cell: (info) => info.getValue() ?? "—" }),
        helper.accessor("created_at", { header: t.customers.createdAt, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
      ] as DataTableColumn<CustomerRow>[],
    [t, locale],
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={100}
      getRowId={(r) => r.id}
      labels={{ previous: t.common.previous, next: t.common.next, empty: t.common.noResults, page: (page, total) => interpolate(t.common.page, { page, total }) }}
    />
  );
}

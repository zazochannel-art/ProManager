"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/currency/format";
import type { ProjectStatus } from "../schemas/project";

export interface ProjectRow {
  id: string;
  name: string;
  code: string | null;
  status: string;
  customer_name: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_amount: string | null;
  currency: string;
}

const STATUS_VARIANT: Record<ProjectStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  planned: "neutral",
  active: "primary",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
};

const helper = createColumnHelper<typeof dataTableFeatures, ProjectRow>();

export function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  const { t, locale } = useI18n();
  const columns = useMemo(
    () =>
      [
        helper.accessor("name", {
          header: t.projects.name,
          sortFn: "text",
          cell: (info) => (
            <span className="flex flex-col">
              <span className="font-medium">{info.getValue()}</span>
              {info.row.original.code ? <span className="text-xs text-muted-foreground">{info.row.original.code}</span> : null}
            </span>
          ),
        }),
        helper.accessor("customer_name", { header: t.projects.customer, enableSorting: false, cell: (info) => info.getValue() ?? t.projects.noCustomer }),
        helper.accessor("status", {
          header: t.projects.status,
          enableSorting: false,
          cell: (info) => {
            const status = info.getValue() as ProjectStatus;
            return <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{t.projects.statuses[status] ?? status}</Badge>;
          },
        }),
        helper.accessor("start_date", { header: t.projects.startDate, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
        helper.accessor("end_date", { header: t.projects.endDate, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
        helper.accessor("budget_amount", {
          header: t.projects.budget,
          enableSorting: false,
          cell: (info) => {
            const v = info.getValue();
            return <span className="tabular-nums">{v === null ? "—" : formatMoney(v, info.row.original.currency, locale)}</span>;
          },
        }),
      ] as DataTableColumn<ProjectRow>[],
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

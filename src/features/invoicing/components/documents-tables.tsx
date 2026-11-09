"use client";

import { useMemo } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/currency/format";
import { ESTIMATE_STATUS_VARIANT, INVOICE_STATUS_VARIANT, type EstimateStatus, type InvoiceStatus } from "../schemas/document";

export interface EstimateTableRow {
  id: string;
  number: string | null;
  title: string | null;
  status: EstimateStatus;
  customer_name: string | null;
  issue_date: string;
  valid_until: string | null;
  total: string;
  currency: string;
}

export interface InvoiceTableRow {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  customer_name: string | null;
  issue_date: string;
  due_date: string | null;
  total: string;
  balance_due: string;
  currency: string;
  is_overdue: boolean;
}

const estimateHelper = createColumnHelper<typeof dataTableFeatures, EstimateTableRow>();
const invoiceHelper = createColumnHelper<typeof dataTableFeatures, InvoiceTableRow>();

function useLabels() {
  const { t } = useI18n();
  return { previous: t.common.previous, next: t.common.next, empty: t.common.noResults, page: (page: number, total: number) => interpolate(t.common.page, { page, total }) };
}

export function EstimatesTable({ rows }: { rows: EstimateTableRow[] }) {
  const { t, locale } = useI18n();
  const labels = useLabels();
  const columns = useMemo(
    () =>
      [
        estimateHelper.accessor("number", {
          header: t.estimates.number,
          enableSorting: false,
          cell: (info) => (
            <span className="flex flex-col">
              <Link href={`/dashboard/estimates/${info.row.original.id}`} className="font-medium font-mono hover:text-primary hover:underline">
                {info.getValue() ?? "—"}
              </Link>
              <span className="max-w-64 truncate text-xs text-muted-foreground">{info.row.original.title ?? t.estimates.untitled}</span>
            </span>
          ),
        }),
        estimateHelper.accessor("customer_name", { header: t.invoicing.customer, enableSorting: false, cell: (info) => info.getValue() ?? "—" }),
        estimateHelper.accessor("status", {
          header: t.projects.status,
          enableSorting: false,
          cell: (info) => <Badge variant={ESTIMATE_STATUS_VARIANT[info.getValue()]}>{t.estimates.statuses[info.getValue()]}</Badge>,
        }),
        estimateHelper.accessor("issue_date", { header: t.invoicing.issueDate, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
        estimateHelper.accessor("valid_until", { header: t.estimates.validUntil, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
        estimateHelper.accessor("total", {
          header: t.invoicing.total,
          enableSorting: false,
          cell: (info) => <span className="font-medium tabular-nums">{formatMoney(info.getValue(), info.row.original.currency, locale)}</span>,
        }),
      ] as DataTableColumn<EstimateTableRow>[],
    [t, locale],
  );
  return <DataTable columns={columns} data={rows} pageSize={100} getRowId={(r) => r.id} labels={labels} />;
}

export function InvoicesTable({ rows }: { rows: InvoiceTableRow[] }) {
  const { t, locale } = useI18n();
  const labels = useLabels();
  const columns = useMemo(
    () =>
      [
        invoiceHelper.accessor("number", {
          header: t.invoices.number,
          enableSorting: false,
          cell: (info) => (
            <Link href={`/dashboard/invoices/${info.row.original.id}`} className="font-medium font-mono hover:text-primary hover:underline">
              {info.getValue() ?? t.invoices.draftNumber}
            </Link>
          ),
        }),
        invoiceHelper.accessor("customer_name", { header: t.invoicing.customer, enableSorting: false, cell: (info) => info.getValue() ?? "—" }),
        invoiceHelper.accessor("status", {
          header: t.projects.status,
          enableSorting: false,
          cell: (info) => (
            <span className="flex flex-wrap gap-1">
              <Badge variant={INVOICE_STATUS_VARIANT[info.getValue()]}>{t.invoices.statuses[info.getValue()]}</Badge>
              {info.row.original.is_overdue ? <Badge variant="danger">{t.invoices.overdue}</Badge> : null}
            </span>
          ),
        }),
        invoiceHelper.accessor("issue_date", { header: t.invoicing.issueDate, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
        invoiceHelper.accessor("due_date", {
          header: t.invoices.dueDate,
          sortFn: "datetime",
          cell: (info) => <span className={info.row.original.is_overdue ? "font-medium text-danger" : undefined}>{formatDate(info.getValue(), locale)}</span>,
        }),
        invoiceHelper.accessor("total", {
          header: t.invoicing.total,
          enableSorting: false,
          cell: (info) => <span className="tabular-nums">{formatMoney(info.getValue(), info.row.original.currency, locale)}</span>,
        }),
        invoiceHelper.accessor("balance_due", {
          header: t.invoices.balance,
          enableSorting: false,
          cell: (info) => {
            const row = info.row.original;
            const open = row.status === "issued" || row.status === "partially_paid";
            return <span className="font-medium tabular-nums">{open ? formatMoney(info.getValue(), row.currency, locale) : "—"}</span>;
          },
        }),
      ] as DataTableColumn<InvoiceTableRow>[],
    [t, locale],
  );
  return <DataTable columns={columns} data={rows} pageSize={100} getRowId={(r) => r.id} labels={labels} />;
}

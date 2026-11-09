"use client";

import { useMemo } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/currency/format";
import { PAYMENT_METHODS, type PaymentMethod } from "@/features/invoicing/schemas/document";
import { ReasonDialog } from "@/features/invoicing/components/reason-dialog";
import { voidPaymentFromListAction } from "../actions/payment-actions";

export interface PaymentTableRow {
  id: string;
  number: string;
  customer_name: string | null;
  amount: string;
  currency: string;
  method: string;
  paid_on: string;
  reference: string | null;
  voided_at: string | null;
  void_reason: string | null;
  invoices: { id: string; number: string | null }[];
}

const helper = createColumnHelper<typeof dataTableFeatures, PaymentTableRow>();
const isMethod = (v: string): v is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(v);

export function PaymentsTable({ rows, canWrite }: { rows: PaymentTableRow[]; canWrite: boolean }) {
  const { t, locale } = useI18n();
  const labels = { previous: t.common.previous, next: t.common.next, empty: t.common.noResults, page: (page: number, total: number) => interpolate(t.common.page, { page, total }) };
  const columns = useMemo(
    () =>
      [
        helper.accessor("number", {
          header: t.payments.number,
          enableSorting: false,
          cell: (info) => (
            <span className="flex flex-col">
              <span className="whitespace-nowrap font-mono font-medium">{info.getValue()}</span>
              {info.row.original.reference ? <span className="max-w-48 truncate text-xs text-muted-foreground">{info.row.original.reference}</span> : null}
            </span>
          ),
        }),
        helper.accessor("customer_name", { header: t.invoicing.customer, enableSorting: false, cell: (info) => info.getValue() ?? "—" }),
        helper.accessor("invoices", {
          header: t.payments.invoices,
          enableSorting: false,
          cell: (info) => (
            <span className="flex flex-wrap gap-x-2 gap-y-0.5">
              {info.getValue().map((inv) => (
                <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`} className="font-mono text-sm hover:text-primary hover:underline">
                  {inv.number ?? t.invoices.draftNumber}
                </Link>
              ))}
            </span>
          ),
        }),
        helper.accessor("method", {
          header: t.invoices.payments.method,
          enableSorting: false,
          cell: (info) => <span className="whitespace-nowrap">{isMethod(info.getValue()) ? t.invoices.payments.methods[info.getValue() as PaymentMethod] : info.getValue()}</span>,
        }),
        helper.accessor("paid_on", { header: t.invoices.payments.paidOn, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
        helper.accessor("amount", {
          header: t.invoices.payments.amount,
          enableSorting: false,
          cell: (info) => {
            const row = info.row.original;
            return row.voided_at ? (
              <span className="flex flex-col items-start gap-1" title={row.void_reason ?? undefined}>
                <span className="tabular-nums text-muted-foreground line-through">{formatMoney(info.getValue(), row.currency, locale)}</span>
                <Badge variant="danger">{t.invoices.payments.voidedLabel}</Badge>
              </span>
            ) : (
              <span className="font-medium tabular-nums">{formatMoney(info.getValue(), row.currency, locale)}</span>
            );
          },
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t.common.actions}</span>,
          cell: (info) => {
            const row = info.row.original;
            if (!canWrite || row.voided_at) return null;
            return (
              <ReasonDialog
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`${t.invoices.payments.void}: ${row.number}`}>
                    <Undo2 aria-hidden="true" />
                  </Button>
                }
                title={t.invoices.payments.voidTitle}
                description={t.payments.voidBody}
                label={t.invoices.voidReason}
                confirmLabel={t.invoices.payments.void}
                successMessage={t.invoices.payments.voided}
                action={(values) => voidPaymentFromListAction(row.id, values)}
              />
            );
          },
        }),
      ] as DataTableColumn<PaymentTableRow>[],
    [t, locale, canWrite],
  );
  return <DataTable columns={columns} data={rows} pageSize={100} getRowId={(r) => r.id} labels={labels} />;
}

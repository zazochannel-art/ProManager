"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckCircle2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/currency/format";
import { deleteExpenseAction, markExpensePaidAction } from "../actions/expense-actions";
import type { ExpenseKind, ExpensePaymentStatus } from "../schemas/finance";
import { ExpenseDialog, type ExpensePickerOptions } from "./expense-dialog";

export interface ExpenseTableRow {
  id: string;
  description: string;
  kind: ExpenseKind;
  category_id: string | null;
  category_name: string | null;
  project_id: string | null;
  project_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  amount: string;
  tax_amount: string;
  total: string;
  currency: string;
  expense_date: string;
  payment_status: ExpensePaymentStatus;
  paid_on: string | null;
  reference: string | null;
}

const helper = createColumnHelper<typeof dataTableFeatures, ExpenseTableRow>();

type Pending = { mode: "edit" | "delete"; row: ExpenseTableRow } | null;

export function ExpensesTable({
  rows,
  options,
  canWrite,
  canDelete,
  today,
}: {
  rows: ExpenseTableRow[];
  options: ExpensePickerOptions;
  canWrite: boolean;
  canDelete: boolean;
  today: string;
}) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const [selected, setSelected] = useState<Pending>(null);
  const [busy, startTransition] = useTransition();
  const labels = { previous: t.common.previous, next: t.common.next, empty: t.common.noResults, page: (page: number, total: number) => interpolate(t.common.page, { page, total }) };

  const columns = useMemo(
    () =>
      [
        helper.accessor("description", {
          header: t.expenses.fields.description,
          enableSorting: false,
          cell: (info) => {
            const r = info.row.original;
            const meta = [r.category_name ?? t.expenses.kinds[r.kind], r.supplier_name].filter(Boolean).join(" · ");
            return (
              <span className="flex max-w-72 flex-col">
                <span className="truncate font-medium">{info.getValue()}</span>
                <span className="truncate text-xs text-muted-foreground">{meta}</span>
              </span>
            );
          },
        }),
        helper.accessor("project_name", {
          header: t.invoicing.project,
          enableSorting: false,
          cell: (info) =>
            info.row.original.project_id ? (
              <Link href={`/dashboard/projects/${info.row.original.project_id}`} className="hover:text-primary hover:underline">
                {info.getValue() ?? "—"}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
        helper.accessor("expense_date", { header: t.expenses.fields.date, sortFn: "datetime", cell: (info) => formatDate(info.getValue(), locale) }),
        helper.accessor("payment_status", {
          header: t.expenses.fields.status,
          enableSorting: false,
          cell: (info) => <Badge variant={info.getValue() === "paid" ? "success" : "warning"}>{t.expenses.statuses[info.getValue()]}</Badge>,
        }),
        helper.accessor("total", {
          header: t.expenses.fields.total,
          enableSorting: false,
          cell: (info) => {
            const r = info.row.original;
            return (
              <span className="flex flex-col items-end text-right">
                <span className="font-medium tabular-nums">{formatMoney(info.getValue(), r.currency, locale)}</span>
                {Number(r.tax_amount) > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">{interpolate(t.expenses.taxIncluded, { amount: formatMoney(r.tax_amount, r.currency, locale) })}</span>
                ) : null}
              </span>
            );
          },
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t.common.actions}</span>,
          cell: (info) => {
            const r = info.row.original;
            if (!canWrite && !canDelete) return null;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={interpolate(t.expenses.actions, { name: r.description })} disabled={busy}>
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canWrite ? (
                    <DropdownMenuItem onSelect={() => setSelected({ mode: "edit", row: r })}>
                      <Pencil aria-hidden="true" />
                      {t.common.edit}
                    </DropdownMenuItem>
                  ) : null}
                  {canWrite && r.payment_status === "unpaid" ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        startTransition(async () => {
                          await run(() => markExpensePaidAction(r.id, { paidOn: today }), t.expenses.markedPaid);
                        })
                      }
                    >
                      <CheckCircle2 aria-hidden="true" />
                      {t.expenses.markPaid}
                    </DropdownMenuItem>
                  ) : null}
                  {canDelete ? (
                    <>
                      {canWrite ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem className="text-danger" onSelect={() => setSelected({ mode: "delete", row: r })}>
                        <Trash2 aria-hidden="true" />
                        {t.common.delete}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        }),
      ] as DataTableColumn<ExpenseTableRow>[],
    [t, locale, canWrite, canDelete, busy, run, today],
  );

  const editRow = selected?.mode === "edit" ? selected.row : null;
  return (
    <>
      <DataTable columns={columns} data={rows} pageSize={100} getRowId={(r) => r.id} labels={labels} />
      {editRow ? (
        <ExpenseDialog
          key={editRow.id}
          trigger={null}
          open
          onOpenChange={(open) => (open ? null : setSelected(null))}
          expenseId={editRow.id}
          options={options}
          initialValues={{
            description: editRow.description,
            kind: editRow.kind,
            categoryId: editRow.category_id ?? "none",
            projectId: editRow.project_id ?? "none",
            supplierId: editRow.supplier_id ?? "none",
            amount: editRow.amount,
            taxAmount: editRow.tax_amount,
            currency: editRow.currency as ExpenseFormCurrency,
            expenseDate: editRow.expense_date,
            paymentStatus: editRow.payment_status,
            paidOn: editRow.paid_on ?? "",
            reference: editRow.reference ?? "",
          }}
        />
      ) : null}
      <Dialog open={selected?.mode === "delete"} onOpenChange={(open) => (open ? null : setSelected(null))}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>{t.expenses.deleteTitle}</DialogTitle>
            <DialogDescription>{t.expenses.deleteBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelected(null)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                selected?.mode === "delete" &&
                startTransition(async () => {
                  if (await run(() => deleteExpenseAction(selected.row.id), t.expenses.deleted)) setSelected(null);
                })
              }
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ExpenseFormCurrency = Parameters<typeof ExpenseDialog>[0]["initialValues"]["currency"];

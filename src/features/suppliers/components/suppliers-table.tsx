"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Archive, Mail, MoreHorizontal, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency/format";
import { archiveSupplierAction } from "../actions/supplier-actions";
import { SupplierDialog } from "./supplier-dialog";

export interface SupplierTableRow {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  /** Null when the member cannot read expenses. */
  spend: { totals: Record<string, string>; count: number } | null;
}

const helper = createColumnHelper<typeof dataTableFeatures, SupplierTableRow>();

export function SuppliersTable({ rows, canWrite, showSpend, currency }: { rows: SupplierTableRow[]; canWrite: boolean; showSpend: boolean; currency: string }) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const [selected, setSelected] = useState<{ mode: "edit" | "archive"; row: SupplierTableRow } | null>(null);
  const [busy, startTransition] = useTransition();
  const labels = { previous: t.common.previous, next: t.common.next, empty: t.common.noResults, page: (page: number, total: number) => interpolate(t.common.page, { page, total }) };

  const columns = useMemo(() => {
    const cols: DataTableColumn<SupplierTableRow>[] = [
      helper.accessor("name", {
        header: t.suppliers.fields.name,
        enableSorting: false,
        cell: (info) => (
          <span className="flex max-w-72 flex-col">
            <span className="truncate font-medium">{info.getValue()}</span>
            {info.row.original.tax_id ? <span className="truncate text-xs text-muted-foreground">{interpolate(t.suppliers.taxIdShort, { id: info.row.original.tax_id })}</span> : null}
          </span>
        ),
      }) as DataTableColumn<SupplierTableRow>,
      helper.display({
        id: "contact",
        header: t.suppliers.contact,
        cell: (info) => {
          const r = info.row.original;
          if (!r.phone && !r.email) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="flex flex-col gap-0.5 text-sm">
              {r.phone ? (
                <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-primary">
                  <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {r.phone}
                </a>
              ) : null}
              {r.email ? (
                <a href={`mailto:${r.email}`} className="inline-flex max-w-56 items-center gap-1.5 truncate hover:text-primary">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{r.email}</span>
                </a>
              ) : null}
            </span>
          );
        },
      }) as DataTableColumn<SupplierTableRow>,
      helper.accessor("address", { header: t.suppliers.fields.address, enableSorting: false, cell: (info) => <span className="line-clamp-2 max-w-64 text-sm">{info.getValue() ?? "—"}</span> }) as DataTableColumn<SupplierTableRow>,
    ];
    if (showSpend) {
      cols.push(
        helper.display({
          id: "spend",
          header: () => <span className="block text-right">{t.suppliers.spend}</span>,
          cell: (info) => {
            const spend = info.row.original.spend;
            const entries = Object.entries(spend?.totals ?? {}).sort(([a], [b]) => (a === currency ? -1 : b === currency ? 1 : a.localeCompare(b)));
            if (!spend || entries.length === 0) return <span className="block text-right text-muted-foreground">—</span>;
            return (
              <span className="flex flex-col items-end text-right">
                {entries.map(([c, v]) => (
                  <span key={c} className="font-medium whitespace-nowrap tabular-nums">
                    {formatMoney(v, c, locale)}
                  </span>
                ))}
                <span className="text-xs whitespace-nowrap text-muted-foreground">{interpolate(t.suppliers.spendCount, { count: spend.count })}</span>
              </span>
            );
          },
        }) as DataTableColumn<SupplierTableRow>,
      );
    }
    if (canWrite) {
      cols.push(
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t.common.actions}</span>,
          cell: (info) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={interpolate(t.suppliers.actions, { name: info.row.original.name })} disabled={busy}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSelected({ mode: "edit", row: info.row.original })}>
                  <Pencil aria-hidden="true" />
                  {t.common.edit}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger" onSelect={() => setSelected({ mode: "archive", row: info.row.original })}>
                  <Archive aria-hidden="true" />
                  {t.suppliers.archive}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        }) as DataTableColumn<SupplierTableRow>,
      );
    }
    return cols;
  }, [t, locale, canWrite, showSpend, currency, busy]);

  const edit = selected?.mode === "edit" ? selected.row : null;
  return (
    <>
      <DataTable columns={columns} data={rows} pageSize={100} getRowId={(r) => r.id} labels={labels} />
      {edit ? (
        <SupplierDialog
          key={edit.id}
          trigger={null}
          open
          onOpenChange={(open) => (open ? null : setSelected(null))}
          supplierId={edit.id}
          initialValues={{ name: edit.name, taxId: edit.tax_id ?? "", email: edit.email ?? "", phone: edit.phone ?? "", website: edit.website ?? "", address: edit.address ?? "", notes: edit.notes ?? "" }}
        />
      ) : null}
      <Dialog open={selected?.mode === "archive"} onOpenChange={(open) => (open ? null : setSelected(null))}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>{t.suppliers.archiveTitle}</DialogTitle>
            <DialogDescription>{t.suppliers.archiveBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelected(null)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                selected?.mode === "archive" &&
                startTransition(async () => {
                  if (await run(() => archiveSupplierAction(selected.row.id), t.suppliers.archived)) setSelected(null);
                })
              }
            >
              {t.suppliers.archive}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

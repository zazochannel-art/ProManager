"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Archive, History, MoreHorizontal, PackageMinus, PackagePlus, Pencil, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatMoney, formatQuantity } from "@/lib/currency/format";
import { archiveItemAction } from "../actions/inventory-actions";
import type { MovementKind } from "../schemas/inventory";
import { ItemDialog } from "./item-dialog";
import { ItemHistoryDialog } from "./item-history-dialog";
import { MovementDialog } from "./movement-dialog";

export interface InventoryTableRow {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  unit_cost: string | null;
  sale_price: string | null;
  currency: string | null;
  reorder_level: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  on_hand: string;
  stock_value: string | null;
  low: boolean;
}

type Selected =
  | { mode: "edit" | "archive" | "history"; row: InventoryTableRow }
  | { mode: "move"; row: InventoryTableRow; kind: MovementKind }
  | null;

const helper = createColumnHelper<typeof dataTableFeatures, InventoryTableRow>();

export function InventoryTable({
  rows,
  canWrite,
  suppliers,
  projects,
  today,
  orgCurrency,
}: {
  rows: InventoryTableRow[];
  canWrite: boolean;
  suppliers: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  today: string;
  orgCurrency: string;
}) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const [selected, setSelected] = useState<Selected>(null);
  const [busy, startTransition] = useTransition();
  const labels = { previous: t.common.previous, next: t.common.next, empty: t.common.noResults, page: (page: number, total: number) => interpolate(t.common.page, { page, total }) };
  const money = (v: string | null, c: string | null) => (v && c ? formatMoney(v, c, locale) : "—");

  const columns = useMemo(
    () =>
      [
        helper.accessor("name", {
          header: t.inventory.fields.name,
          enableSorting: true,
          cell: (info) => {
            const r = info.row.original;
            const meta = [r.sku, r.supplier_name].filter(Boolean).join(" · ");
            return (
              <span className="flex max-w-72 flex-col">
                <span className="truncate font-medium">{info.getValue()}</span>
                {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
              </span>
            );
          },
        }),
        helper.accessor("on_hand", {
          header: () => <span className="block text-right">{t.inventory.onHand}</span>,
          enableSorting: false,
          cell: (info) => {
            const r = info.row.original;
            const empty = Number(r.on_hand) <= 0;
            return (
              <span className="flex flex-col items-end gap-1 text-right">
                <span className={empty ? "font-medium whitespace-nowrap tabular-nums text-danger" : "font-medium whitespace-nowrap tabular-nums"}>
                  {formatQuantity(r.on_hand, locale)} {r.unit}
                </span>
                {r.low ? <Badge variant={empty ? "danger" : "warning"}>{empty ? t.inventory.outOfStock : t.inventory.lowStock}</Badge> : null}
              </span>
            );
          },
        }),
        helper.accessor("reorder_level", {
          header: () => <span className="block text-right">{t.inventory.fields.reorderLevel}</span>,
          enableSorting: false,
          cell: (info) => <span className="block text-right whitespace-nowrap tabular-nums text-muted-foreground">{info.getValue() ? `${formatQuantity(info.getValue() ?? "0", locale)} ${info.row.original.unit}` : "—"}</span>,
        }),
        helper.accessor("unit_cost", {
          header: () => <span className="block text-right">{t.inventory.fields.unitCost}</span>,
          enableSorting: false,
          cell: (info) => <span className="block text-right whitespace-nowrap tabular-nums">{money(info.getValue(), info.row.original.currency)}</span>,
        }),
        helper.accessor("stock_value", {
          header: () => <span className="block text-right">{t.inventory.stockValue}</span>,
          enableSorting: false,
          cell: (info) => {
            const r = info.row.original;
            return <span className="block text-right font-medium whitespace-nowrap tabular-nums">{Number(r.on_hand) > 0 ? money(r.stock_value, r.currency) : "—"}</span>;
          },
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t.common.actions}</span>,
          cell: (info) => {
            const r = info.row.original;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={interpolate(t.inventory.actions, { name: r.name })} disabled={busy}>
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canWrite ? (
                    <>
                      <DropdownMenuItem onSelect={() => setSelected({ mode: "move", row: r, kind: "receipt" })}>
                        <PackagePlus aria-hidden="true" />
                        {t.inventory.movements.kinds.receipt}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSelected({ mode: "move", row: r, kind: "issue" })} disabled={Number(r.on_hand) <= 0}>
                        <PackageMinus aria-hidden="true" />
                        {t.inventory.movements.kinds.issue}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSelected({ mode: "move", row: r, kind: "adjustment" })}>
                        <SlidersHorizontal aria-hidden="true" />
                        {t.inventory.movements.kinds.adjustment}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem onSelect={() => setSelected({ mode: "history", row: r })}>
                    <History aria-hidden="true" />
                    {t.inventory.movements.history}
                  </DropdownMenuItem>
                  {canWrite ? (
                    <>
                      <DropdownMenuItem onSelect={() => setSelected({ mode: "edit", row: r })}>
                        <Pencil aria-hidden="true" />
                        {t.common.edit}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-danger" onSelect={() => setSelected({ mode: "archive", row: r })}>
                        <Archive aria-hidden="true" />
                        {t.inventory.archive}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        }),
      ] as DataTableColumn<InventoryTableRow>[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- money only depends on locale
    [t, locale, canWrite, busy],
  );

  return (
    <>
      <DataTable columns={columns} data={rows} pageSize={50} getRowId={(r) => r.id} labels={labels} />
      {selected?.mode === "edit" ? (
        <ItemDialog
          key={selected.row.id}
          trigger={null}
          open
          onOpenChange={(open) => (open ? null : setSelected(null))}
          itemId={selected.row.id}
          suppliers={suppliers}
          initialValues={{
            name: selected.row.name,
            sku: selected.row.sku ?? "",
            unit: selected.row.unit,
            description: selected.row.description ?? "",
            unitCost: selected.row.unit_cost ?? "",
            salePrice: selected.row.sale_price ?? "",
            currency: (selected.row.currency ?? orgCurrency) as never,
            reorderLevel: selected.row.reorder_level ?? "",
            supplierId: selected.row.supplier_id ?? "none",
          }}
        />
      ) : null}
      {selected?.mode === "move" ? (
        <MovementDialog key={`${selected.row.id}-${selected.kind}`} item={selected.row} kind={selected.kind} projects={projects} today={today} onClose={() => setSelected(null)} />
      ) : null}
      {selected?.mode === "history" ? <ItemHistoryDialog item={selected.row} onClose={() => setSelected(null)} /> : null}
      <Dialog open={selected?.mode === "archive"} onOpenChange={(open) => (open ? null : setSelected(null))}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>{t.inventory.archiveTitle}</DialogTitle>
            <DialogDescription>{t.inventory.archiveBody}</DialogDescription>
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
                  if (await run(() => archiveItemAction(selected.row.id), t.inventory.archived)) setSelected(null);
                })
              }
            >
              {t.inventory.archive}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

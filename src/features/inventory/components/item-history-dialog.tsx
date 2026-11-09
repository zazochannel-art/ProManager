"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney, formatQuantity } from "@/lib/currency/format";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { listItemMovementsAction } from "../actions/inventory-actions";
import type { MovementRow } from "../services/inventory-service";

/** The latest stock movements of one item (read-only ledger). */
export function ItemHistoryDialog({ item, onClose }: { item: { id: string; name: string; unit: string; currency: string | null }; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<MovementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listItemMovementsAction(item.id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRows(result.data);
        else setError(actionErrorMessage(t, result.error));
      })
      .catch(() => !cancelled && setError(t.common.genericError));
    return () => {
      cancelled = true;
    };
  }, [item.id, t]);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{t.inventory.movements.historyBody}</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!rows && !error ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : null}
        {rows && rows.length === 0 ? <p className="text-sm text-muted-foreground">{t.inventory.movements.empty}</p> : null}
        {rows && rows.length > 0 ? (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
            {rows.map((m) => {
              const negative = m.quantity.startsWith("-");
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <Badge variant={negative ? "warning" : "success"}>{t.inventory.movements.types[m.movement_type]}</Badge>
                      <span className="text-muted-foreground">{formatDate(m.occurred_at.slice(0, 10), locale)}</span>
                    </p>
                    {m.project_name || m.reference ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{[m.project_name, m.reference].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={negative ? "font-medium tabular-nums text-warning" : "font-medium tabular-nums text-success"}>
                      {negative ? "−" : "+"}
                      {formatQuantity(m.quantity.replace("-", ""), locale)} {item.unit}
                    </p>
                    {m.unit_cost && item.currency ? <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(m.unit_cost, item.currency, locale)}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

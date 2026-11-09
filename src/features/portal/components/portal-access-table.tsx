"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, dataTableFeatures, type DataTableColumn } from "@/components/data-table/data-table";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import type { PortalAccessStatus } from "../schemas/portal";
import { revokePortalAccessAction } from "../actions/portal-actions";

export interface PortalAccessTableRow {
  id: string;
  customer_name: string | null;
  email: string;
  can_view_invoices: boolean;
  can_view_estimates: boolean;
  can_view_projects: boolean;
  expires_at: string;
  last_accessed_at: string | null;
  status: PortalAccessStatus;
}

const helper = createColumnHelper<typeof dataTableFeatures, PortalAccessTableRow>();
const STATUS_VARIANT = { active: "success", expired: "warning", revoked: "neutral" } as const;

export function PortalAccessTable({ rows }: { rows: PortalAccessTableRow[] }) {
  const { t, locale } = useI18n();
  const run = useRunAction();
  const labels = { previous: t.common.previous, next: t.common.next, empty: t.common.noResults, page: (page: number, total: number) => interpolate(t.common.page, { page, total }) };
  const columns = useMemo(
    () =>
      [
        helper.accessor("customer_name", {
          header: t.clientPortal.columns.customer,
          enableSorting: false,
          cell: (info) => (
            <span className="flex flex-col">
              <span className="font-medium">{info.getValue() ?? "—"}</span>
              <span className="max-w-64 truncate text-xs text-muted-foreground">{info.row.original.email}</span>
            </span>
          ),
        }),
        helper.display({
          id: "shares",
          header: t.clientPortal.columns.shares,
          cell: (info) => {
            const r = info.row.original;
            const parts = [r.can_view_invoices && t.clientPortal.shareShort.invoices, r.can_view_estimates && t.clientPortal.shareShort.estimates, r.can_view_projects && t.clientPortal.shareShort.projects].filter(Boolean);
            return <span className="text-sm">{parts.join(" · ")}</span>;
          },
        }),
        helper.accessor("status", {
          header: t.clientPortal.columns.status,
          enableSorting: false,
          cell: (info) => <Badge variant={STATUS_VARIANT[info.getValue()]}>{t.clientPortal.statuses[info.getValue()]}</Badge>,
        }),
        helper.accessor("expires_at", {
          header: t.clientPortal.columns.expires,
          enableSorting: false,
          cell: (info) => <span className="whitespace-nowrap">{formatDate(info.getValue().slice(0, 10), locale)}</span>,
        }),
        helper.accessor("last_accessed_at", {
          header: t.clientPortal.columns.lastAccess,
          enableSorting: false,
          cell: (info) => <span className="whitespace-nowrap text-muted-foreground">{info.getValue() ? formatDate(info.getValue()!.slice(0, 10), locale) : t.clientPortal.never}</span>,
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t.common.actions}</span>,
          cell: (info) => {
            const r = info.row.original;
            if (r.status !== "active") return null;
            return (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" aria-label={interpolate(t.clientPortal.revokeLabel, { name: r.customer_name ?? r.email })}>
                    <Ban aria-hidden="true" />
                    {t.clientPortal.revoke}
                  </Button>
                }
                title={t.clientPortal.revokeTitle}
                description={t.clientPortal.revokeBody}
                confirmLabel={t.clientPortal.revoke}
                cancelLabel={t.common.cancel}
                onConfirm={async () => {
                  await run(() => revokePortalAccessAction(r.id), t.clientPortal.revoked);
                }}
              />
            );
          },
        }),
      ] as DataTableColumn<PortalAccessTableRow>[],
    [t, locale, run],
  );
  return <DataTable columns={columns} data={rows} pageSize={50} getRowId={(r) => r.id} labels={labels} />;
}

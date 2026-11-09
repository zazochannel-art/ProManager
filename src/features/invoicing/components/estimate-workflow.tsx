"use client";

import { useTransition } from "react";
import { ChevronDown, FileOutput, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useI18n } from "@/lib/i18n/client";
import { convertEstimateAction, deleteEstimateAction, setEstimateStatusAction } from "../actions/estimate-actions";
import { ESTIMATE_TRANSITIONS, estimateConvertible, type EstimateStatus } from "../schemas/document";
import { useDocumentAction } from "./use-document-action";

export function EstimateWorkflow({
  estimateId,
  status,
  hasLines,
  canWrite,
  canConvert,
  canDelete,
}: {
  estimateId: string;
  status: EstimateStatus;
  hasLines: boolean;
  canWrite: boolean;
  /** invoices.write: converting creates an invoice. */
  canConvert: boolean;
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const run = useDocumentAction();
  const [pending, startTransition] = useTransition();
  const transitions = canWrite ? ESTIMATE_TRANSITIONS[status] : [];

  return (
    <>
      {transitions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" loading={pending}>
              {t.estimates.changeStatus}
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transitions.map((next) => (
              <DropdownMenuItem
                key={next}
                onSelect={() =>
                  startTransition(async () => {
                    await run(() => setEstimateStatusAction(estimateId, next), t.estimates.statusChanged);
                  })
                }
              >
                {t.estimates.transitions[next]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canConvert && estimateConvertible(status) && hasLines ? (
        <ConfirmDialog
          trigger={
            <Button>
              <FileOutput aria-hidden="true" />
              {t.estimates.convert}
            </Button>
          }
          title={t.estimates.convertTitle}
          description={t.estimates.convertBody}
          confirmLabel={t.estimates.convert}
          cancelLabel={t.common.cancel}
          destructive={false}
          onConfirm={async () => {
            await run(() => convertEstimateAction(estimateId), t.estimates.converted, { redirectTo: ({ invoiceId }) => `/dashboard/invoices/${invoiceId}` });
          }}
        />
      ) : null}
      {canDelete && status === "draft" ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" aria-label={t.common.delete}>
              <Trash2 aria-hidden="true" />
              {t.common.delete}
            </Button>
          }
          title={t.estimates.deleteTitle}
          description={t.estimates.deleteBody}
          confirmLabel={t.common.delete}
          cancelLabel={t.common.cancel}
          onConfirm={async () => {
            await run(() => deleteEstimateAction(estimateId), t.estimates.deleted, { redirectTo: () => "/dashboard/estimates" });
          }}
        />
      ) : null}
    </>
  );
}

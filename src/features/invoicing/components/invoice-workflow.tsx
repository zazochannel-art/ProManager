"use client";

import { Ban, Printer, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useI18n } from "@/lib/i18n/client";
import { deleteInvoiceAction, issueInvoiceAction, voidInvoiceAction } from "../actions/invoice-actions";
import type { InvoiceStatus } from "../schemas/document";
import { ReasonDialog } from "./reason-dialog";
import { useDocumentAction } from "./use-document-action";

export function InvoiceWorkflow({
  invoiceId,
  status,
  hasLines,
  hasPayments,
  fromEstimate,
  canWrite,
  canDelete,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  hasLines: boolean;
  hasPayments: boolean;
  /** A draft created from an estimate is referenced by it and cannot be deleted. */
  fromEstimate: boolean;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const run = useDocumentAction();
  return (
    <>
      {status !== "draft" ? <PrintButton /> : null}
      {canWrite && status === "draft" && hasLines ? (
        <ConfirmDialog
          trigger={
            <Button>
              <Send aria-hidden="true" />
              {t.invoices.issue}
            </Button>
          }
          title={t.invoices.issueTitle}
          description={t.invoices.issueBody}
          confirmLabel={t.invoices.issue}
          cancelLabel={t.common.cancel}
          destructive={false}
          onConfirm={async () => {
            await run(() => issueInvoiceAction(invoiceId), t.invoices.issued);
          }}
        />
      ) : null}
      {canWrite && status === "issued" && !hasPayments ? (
        <ReasonDialog
          trigger={
            <Button variant="ghost">
              <Ban aria-hidden="true" />
              {t.invoices.void}
            </Button>
          }
          title={t.invoices.voidTitle}
          description={t.invoices.voidBody}
          label={t.invoices.voidReason}
          confirmLabel={t.invoices.void}
          successMessage={t.invoices.voided}
          action={(values) => voidInvoiceAction(invoiceId, values)}
        />
      ) : null}
      {canDelete && status === "draft" && !fromEstimate ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost">
              <Trash2 aria-hidden="true" />
              {t.common.delete}
            </Button>
          }
          title={t.invoices.deleteTitle}
          description={t.invoices.deleteBody}
          confirmLabel={t.common.delete}
          cancelLabel={t.common.cancel}
          onConfirm={async () => {
            await run(() => deleteInvoiceAction(invoiceId), t.invoices.deleted, { redirectTo: () => "/dashboard/invoices" });
          }}
        />
      ) : null}
    </>
  );
}

/** Opens the browser print dialog; the page has a print-only document layout ("Save as PDF" works too). */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      {t.invoicing.print}
    </Button>
  );
}

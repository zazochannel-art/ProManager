"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { createEstimateAction, updateEstimateAction } from "../actions/estimate-actions";
import { createInvoiceAction, updateInvoiceAction } from "../actions/invoice-actions";
import type { DocumentKind } from "../schemas/document";
import { DocumentHeaderForm, type DocumentHeaderValues, type DocumentPickerOptions } from "./document-header-form";

/**
 * Create (documentId undefined) or edit the header of an estimate or invoice.
 * After creating, the user lands on the new document to add its lines.
 */
export function DocumentHeaderDialog({
  kind,
  options,
  initialValues,
  documentId,
  label,
}: {
  kind: DocumentKind;
  options: DocumentPickerOptions;
  initialValues: DocumentHeaderValues;
  documentId?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editing = Boolean(documentId);
  const texts = kind === "estimate" ? t.estimates : t.invoices;
  const action = (values: DocumentHeaderValues) => {
    if (kind === "estimate") return documentId ? updateEstimateAction(documentId, values) : createEstimateAction(values);
    return documentId ? updateInvoiceAction(documentId, values) : createInvoiceAction(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="secondary">
            <Pencil aria-hidden="true" />
            {texts.edit}
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" />
            {label ?? texts.new}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? texts.editTitle : texts.new}</DialogTitle>
          {editing ? null : <DialogDescription>{texts.newBody}</DialogDescription>}
        </DialogHeader>
        <DocumentHeaderForm
          kind={kind}
          options={options}
          initialValues={initialValues}
          action={action}
          submitLabel={editing ? t.common.save : t.common.create}
          onSuccess={(id) => {
            setOpen(false);
            toast.success(editing ? texts.updated : texts.created);
            if (editing) router.refresh();
            else router.push(kind === "estimate" ? `/dashboard/estimates/${id}` : `/dashboard/invoices/${id}`);
          }}
          secondaryAction={
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

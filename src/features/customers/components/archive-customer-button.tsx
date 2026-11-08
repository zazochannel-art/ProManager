"use client";

import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { archiveCustomerAction } from "../actions/customer-actions";

export function ArchiveCustomerButton({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const run = useRunAction();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost">
          <Archive aria-hidden="true" />
          {t.customers.archive}
        </Button>
      }
      title={t.customers.archiveTitle}
      description={t.customers.archiveBody}
      confirmLabel={t.customers.archive}
      cancelLabel={t.common.cancel}
      onConfirm={async () => {
        await run(() => archiveCustomerAction(customerId), t.customers.archived, { redirectTo: "/dashboard/customers" });
      }}
    />
  );
}

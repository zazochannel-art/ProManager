"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { deleteOrganizationAction } from "@/features/organizations/actions/organization-actions";

/** Owner-only "danger zone": the owner must type the organization slug to confirm. */
export function DeleteOrganizationCard({ slug, organizationName }: { slug: string; organizationName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === slug;

  async function confirm() {
    const result = await deleteOrganizationAction(typed);
    if (!result.ok) {
      toast.error(actionErrorMessage(t, result.error));
      return;
    }
    toast.success(t.settings.organizationDeleted);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-danger/40 p-4" aria-labelledby="danger-zone-title">
      <h3 id="danger-zone-title" className="font-semibold text-danger">
        {t.settings.dangerZone}
      </h3>
      <p className="text-sm text-muted-foreground">{interpolate(t.settings.deleteOrganizationDescription, { organization: organizationName })}</p>
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Label htmlFor="confirm-org-slug">{interpolate(t.settings.deleteOrganizationTypeSlug, { slug })}</Label>
        <Input id="confirm-org-slug" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <div>
        <ConfirmDialog
          trigger={
            <Button variant="danger" disabled={!matches}>
              {t.settings.deleteOrganization}
            </Button>
          }
          title={t.settings.deleteOrganization}
          description={interpolate(t.settings.deleteOrganizationDescription, { organization: organizationName })}
          confirmLabel={t.settings.deleteOrganization}
          cancelLabel={t.common.cancel}
          onConfirm={confirm}
        />
      </div>
    </section>
  );
}

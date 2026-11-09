import type { Metadata } from "next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { listPortalAccess, listPortalCustomerOptions } from "@/features/portal/services/portal-access-service";
import { PortalAccessDialog } from "@/features/portal/components/portal-access-dialog";
import { PortalAccessTable } from "@/features/portal/components/portal-access-table";

export const metadata: Metadata = { title: "Client portal" };

/** Staff side of the client portal: create, list and revoke customers' private links (portal.manage). */
export default async function ClientPortalPage() {
  const ctx = await requirePagePermission("portal.manage");
  const { t } = await getI18n();
  const supabase = await createClient();
  const [rows, customers] = await Promise.all([listPortalAccess(supabase, ctx.organization.id), listPortalCustomerOptions(supabase, ctx.organization.id)]);
  const createButton = <PortalAccessDialog customers={customers} />;
  return (
    <>
      <PageHeader title={t.clientPortal.title} description={t.clientPortal.description} actions={createButton} />
      {rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t.clientPortal.empty} description={customers.length === 0 ? t.clientPortal.noCustomers : t.clientPortal.emptyBody} action={createButton} />
      ) : (
        <PortalAccessTable rows={rows} />
      )}
      <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
        <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t.clientPortal.note}
      </p>
    </>
  );
}

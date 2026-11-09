import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getPortalOverview, resolvePortalAccess } from "@/features/portal/services/portal-service";
import { PortalUnavailable } from "@/features/portal/components/portal-shell";
import { PortalOverview } from "@/features/portal/components/portal-overview";

export const metadata: Metadata = { title: "Client portal", robots: { index: false, follow: false } };

/** What a customer sees through their private link (no account needed). */
export default async function PortalHomePage({ params }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const { t, locale } = await getI18n();
  const resolved = await resolvePortalAccess(token);
  if (resolved.status !== "ok") return <PortalUnavailable status={resolved.status} t={t} />;
  const data = await getPortalOverview(resolved.admin, resolved.access);
  return <PortalOverview token={token} access={resolved.access} data={data} t={t} locale={locale} />;
}

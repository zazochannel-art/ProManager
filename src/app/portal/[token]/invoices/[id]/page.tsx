import type { Metadata } from "next";
import { PortalDocumentPage } from "@/features/portal/components/portal-document-page";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function PortalInvoicePage({ params }: PageProps<"/portal/[token]/invoices/[id]">) {
  const { token, id } = await params;
  return <PortalDocumentPage token={token} id={id} kind="invoice" />;
}

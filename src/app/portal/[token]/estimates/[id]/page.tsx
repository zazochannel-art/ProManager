import type { Metadata } from "next";
import { PortalDocumentPage } from "@/features/portal/components/portal-document-page";

export const metadata: Metadata = { title: "Estimate", robots: { index: false, follow: false } };

export default async function PortalEstimatePage({ params }: PageProps<"/portal/[token]/estimates/[id]">) {
  const { token, id } = await params;
  return <PortalDocumentPage token={token} id={id} kind="estimate" />;
}

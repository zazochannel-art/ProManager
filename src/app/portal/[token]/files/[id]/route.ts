import { NextResponse } from "next/server";
import { uuidField } from "@/lib/validation/common";
import { getPortalFileUrl, resolvePortalAccess } from "@/features/portal/services/portal-service";

/** Downloads a file shared with the customer: checks the link, then redirects to a one-minute signed URL. */
export async function GET(_request: Request, { params }: RouteContext<"/portal/[token]/files/[id]">) {
  const { token, id } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!uuidField.safeParse(id).success) return notFound();
  const resolved = await resolvePortalAccess(token);
  if (resolved.status !== "ok") return notFound();
  const url = await getPortalFileUrl(resolved.admin, resolved.access, id);
  if (!url) return notFound();
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

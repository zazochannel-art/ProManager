"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/config/env";
import { isLocale } from "@/config/site";
import { getDictionary, interpolate } from "@/lib/i18n";
import { escapeHtml, sendEmail } from "@/lib/email/send";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { withDocumentContext } from "@/features/invoicing/actions/shared";
import { createInvitationToken } from "@/features/organizations/services/invitation-token";
import { portalAccessSchema, type PortalAccessInput } from "../schemas/portal";

/**
 * Client portal links (RLS: portal.manage for read, insert and update). Only
 * the SHA-256 hash of the token is stored; the link itself is returned once,
 * to be copied, and e-mailed when e-mail is configured.
 */
export async function createPortalAccessAction(input: PortalAccessInput): Promise<ActionResult<{ url: string; email: string; emailSent: boolean; expiresAt: string }>> {
  return withDocumentContext("portal.manage", [], async (ctx) => {
    const parsed = portalAccessSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, preferred_locale")
      .eq("organization_id", ctx.organization.id)
      .eq("id", v.customerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (customerError) return fail(mapDatabaseError(customerError));
    if (!customer) return fail("not_found");

    const { token, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + v.validDays * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("client_portal_access").insert({
      organization_id: ctx.organization.id,
      customer_id: customer.id,
      email: v.email,
      token_hash: tokenHash,
      can_view_invoices: v.canViewInvoices,
      can_view_estimates: v.canViewEstimates,
      can_view_projects: v.canViewProjects,
      can_view_documents: v.canViewDocuments,
      expires_at: expiresAt,
      created_by: ctx.user.id,
    });
    if (error) return fail(mapDatabaseError(error));

    const url = `${getPublicEnv().NEXT_PUBLIC_APP_URL}/portal/${token}`;
    // The e-mail goes out in the customer's language when one is set.
    const t = getDictionary(isLocale(customer.preferred_locale) ? customer.preferred_locale : ctx.locale);
    const subject = interpolate(t.clientPortal.mail.subject, { organization: ctx.organization.name });
    const body = interpolate(t.clientPortal.mail.body, { organization: ctx.organization.name, customer: customer.name });
    const result = await sendEmail({
      to: v.email,
      subject,
      text: `${body}\n\n${url}\n\n${t.clientPortal.mail.footer}`,
      html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(t.clientPortal.mail.open)}</a></p><p style="color:#64748b;font-size:12px">${escapeHtml(t.clientPortal.mail.footer)}</p>`,
    });
    revalidatePath("/dashboard/client-portal");
    return ok({ url, email: v.email, emailSent: result.sent, expiresAt });
  });
}

export async function revokePortalAccessAction(accessId: string): Promise<ActionResult> {
  return withDocumentContext("portal.manage", [accessId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_portal_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("revoked_at", null)
      .select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidatePath("/dashboard/client-portal");
    return ok(undefined);
  });
}

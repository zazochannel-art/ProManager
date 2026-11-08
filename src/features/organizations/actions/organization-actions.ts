"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_ORG_COOKIE, COUNTRIES, LOCALE_COOKIE } from "@/config/site";
import { getPublicEnv } from "@/config/env";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { getActionContext, getMemberships } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { assignableRoles } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/security/logger";
import { getRequestLocale } from "@/lib/i18n/server";
import { getDictionary, interpolate } from "@/lib/i18n";
import { escapeHtml, sendEmail } from "@/lib/email/send";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { uuidField } from "@/lib/validation/common";
import {
  companyDetailsSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  regionalSettingsSchema,
  updateMemberRoleSchema,
} from "../schemas/organization";
import { advanceFrom, type OnboardingStep } from "../services/onboarding";
import { createInvitationToken } from "../services/invitation-token";

const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 180,
};

async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

async function advanceOnboarding(organizationId: string, completed: OnboardingStep) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .select("onboarding_step")
    .eq("organization_id", organizationId)
    .single();
  if (error) throw new Error(`Failed to read onboarding state: ${error.message}`);
  const next = advanceFrom(data.onboarding_step, completed);
  if (next === data.onboarding_step) return;
  const { error: updateError } = await supabase
    .from("organization_settings")
    .update({ onboarding_step: next, onboarding_completed_at: next === "completed" ? new Date().toISOString() : null })
    .eq("organization_id", organizationId);
  if (updateError) throw new Error(`Failed to update onboarding state: ${updateError.message}`);
}

export async function createOrganizationAction(input: unknown): Promise<ActionResult<{ organizationId: string }>> {
  const user = await getAuthUser();
  if (!user) return fail("unauthenticated");
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const locale = await getRequestLocale();
  const country = COUNTRIES[0];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_country_code: country.code,
    p_default_currency: country.defaultCurrency,
    p_locale: locale,
    p_timezone: country.defaultTimezone,
  });
  if (error) {
    const code = mapDatabaseError(error);
    if (code === "conflict") return fail("conflict", { fieldErrors: { slug: "slugTaken" } });
    if (code === "server") logger.error("org.create_failed", { code: error.code });
    return fail(code);
  }
  (await cookies()).set(ACTIVE_ORG_COOKIE, data, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return ok({ organizationId: data });
}

export async function saveCompanyDetailsAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getActionContext("org.update");
    if (!ctx) return fail("unauthenticated");
    const parsed = companyDetailsSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: v.name,
        legal_name: v.legalName ?? null,
        tax_id: v.taxId ?? null,
        registration_number: v.registrationNumber ?? null,
        email: v.email ?? null,
        phone: v.phone ?? null,
        address_line1: v.addressLine1 ?? null,
        city: v.city ?? null,
        postal_code: v.postalCode ?? null,
      })
      .eq("id", ctx.organization.id);
    if (error) return fail(mapDatabaseError(error));
    await advanceOnboarding(ctx.organization.id, "company");
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

export async function saveRegionalSettingsAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getActionContext("settings.manage");
    if (!ctx) return fail("unauthenticated");
    const parsed = regionalSettingsSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();

    // One database transaction: organization country + settings change together or not at all.
    const { error } = await supabase.rpc("update_regional_settings", {
      p_organization_id: ctx.organization.id,
      p_country_code: v.countryCode,
      p_currency: v.currency,
      p_locale: v.locale,
      p_timezone: v.timezone,
    });
    if (error) return fail(mapDatabaseError(error));

    // The person configuring the workspace also switches their own UI language.
    // The acting user's own preferences follow the organization defaults chosen here.
    const { error: profileError } = await supabase.from("profiles").update({ locale: v.locale, timezone: v.timezone }).eq("id", ctx.user.id);
    if (profileError) return fail(mapDatabaseError(profileError));
    (await cookies()).set(LOCALE_COOKIE, v.locale, { ...COOKIE_OPTIONS, httpOnly: false, maxAge: 60 * 60 * 24 * 365 });

    await advanceOnboarding(ctx.organization.id, "regional");
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

export async function inviteMemberAction(input: unknown): Promise<ActionResult<{ email: string; emailSent: boolean; inviteUrl?: string }>> {
  return guard(async () => {
    const ctx = await getActionContext("members.manage");
    if (!ctx) return fail("unauthenticated");
    const parsed = inviteMemberSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    if (!assignableRoles(ctx.role).includes(parsed.data.role)) return fail("forbidden");
    if (!checkRateLimit("invite", ctx.organization.id).allowed) return fail("rate_limited");

    const { token, tokenHash } = createInvitationToken();
    const supabase = await createClient();
    const { error } = await supabase.from("organization_invitations").insert({
      organization_id: ctx.organization.id,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: tokenHash,
      invited_by: ctx.user.id,
    });
    if (error) return fail(mapDatabaseError(error));

    const inviteUrl = `${getPublicEnv().NEXT_PUBLIC_APP_URL}/invite/${token}`;
    const t = getDictionary(ctx.locale);
    const title = interpolate(t.invitation.title, { organization: ctx.organization.name });
    const result = await sendEmail({
      to: parsed.data.email,
      subject: title,
      text: `${t.invitation.body}\n\n${inviteUrl}`,
      html: `<p>${escapeHtml(t.invitation.body)}</p><p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(t.invitation.accept)}</a></p>`,
    });

    revalidatePath("/dashboard/settings");
    // The raw link is returned only when e-mail could not be sent, so an admin can share it manually.
    return ok({ email: parsed.data.email, emailSent: result.sent, inviteUrl: result.sent ? undefined : inviteUrl });
  });
}

export async function revokeInvitationAction(invitationId: unknown): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getActionContext("members.manage");
    if (!ctx) return fail("unauthenticated");
    const id = uuidField.safeParse(invitationId);
    if (!id.success) return fail("validation");
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("organization_invitations")
      .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id.data)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(mapDatabaseError(error));
    if (!count) return fail("not_found");
    revalidatePath("/dashboard/settings");
    return ok(undefined);
  });
}

export async function updateMemberRoleAction(input: unknown): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getActionContext("members.manage");
    if (!ctx) return fail("unauthenticated");
    const parsed = updateMemberRoleSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    if (!assignableRoles(ctx.role).includes(parsed.data.role)) return fail("forbidden");
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("organization_members")
      .update({ role: parsed.data.role }, { count: "exact" })
      .eq("id", parsed.data.memberId)
      .eq("organization_id", ctx.organization.id);
    if (error) return fail(mapDatabaseError(error));
    if (!count) return fail("not_found");
    revalidatePath("/dashboard/settings");
    return ok(undefined);
  });
}

/** Removing a member = suspending: history (time entries, documents) stays linked. */
export async function suspendMemberAction(memberId: unknown): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getActionContext("members.manage");
    if (!ctx) return fail("unauthenticated");
    const id = uuidField.safeParse(memberId);
    if (!id.success) return fail("validation");
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("organization_members")
      .update({ status: "suspended" }, { count: "exact" })
      .eq("id", id.data)
      .eq("organization_id", ctx.organization.id)
      .neq("user_id", ctx.user.id);
    if (error) return fail(mapDatabaseError(error));
    if (!count) return fail("not_found");
    revalidatePath("/dashboard/settings");
    return ok(undefined);
  });
}

/** Switches the active organization after verifying the membership on the server. */
export async function switchOrganizationAction(organizationId: unknown): Promise<ActionResult> {
  const id = uuidField.safeParse(organizationId);
  if (!id.success) return fail("validation");
  const user = await getAuthUser();
  if (!user) return fail("unauthenticated");
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.organizationId === id.data)) return fail("forbidden");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ last_organization_id: id.data }).eq("id", user.id);
  if (error) return fail(mapDatabaseError(error));
  (await cookies()).set(ACTIVE_ORG_COOKIE, id.data, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Marks the optional onboarding steps (team / customer / project) as done or skipped. */
export async function completeOnboardingStepAction(step: unknown): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getActionContext("settings.manage");
    if (!ctx) return fail("unauthenticated");
    if (step !== "team" && step !== "customer" && step !== "project") return fail("validation");
    await advanceOnboarding(ctx.organization.id, step);
    revalidatePath("/onboarding");
    return ok(undefined);
  });
}

export async function acceptInvitationAction(token: unknown): Promise<ActionResult<{ organizationId: string }>> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return fail("validation");
  const user = await getAuthUser();
  if (!user) return fail("unauthenticated");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return fail(mapDatabaseError(error));
  (await cookies()).set(ACTIVE_ORG_COOKIE, data, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return ok({ organizationId: data });
}

/**
 * Owner-only soft delete of the ACTIVE organization. The database function
 * re-checks the owner role and the typed slug, cancels the subscription and
 * hides the organization from every RLS check.
 */
export async function deleteOrganizationAction(confirmSlug: unknown): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getActionContext();
    if (!ctx) return fail("unauthenticated");
    if (ctx.role !== "owner") return fail("forbidden");
    if (typeof confirmSlug !== "string" || confirmSlug.trim().toLowerCase() !== ctx.organization.slug) {
      return fail("validation");
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_organization", {
      p_organization_id: ctx.organization.id,
      p_confirm_slug: confirmSlug,
    });
    if (error) return fail(mapDatabaseError(error));
    (await cookies()).delete(ACTIVE_ORG_COOKIE);
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

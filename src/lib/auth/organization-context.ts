import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE, isLocale, type CurrencyCode, type Locale } from "@/config/site";
import { createClient } from "@/lib/supabase/server";
import { can, isRole, PermissionError, type Permission, type Role } from "@/lib/permissions";
import type { Tables } from "@/types/database";
import { getAuthUser, requireUser, type AuthUser } from "./session";
import { resolveActiveOrganizationId } from "./resolve-active-organization";

export interface Membership {
  organizationId: string;
  organizationName: string;
  slug: string;
  role: Role;
}

export interface OrganizationContext {
  user: AuthUser;
  profile: Pick<Tables<"profiles">, "id" | "email" | "full_name" | "locale" | "timezone" | "last_organization_id">;
  organization: Tables<"organizations">;
  settings: Tables<"organization_settings">;
  role: Role;
  memberships: Membership[];
  locale: Locale;
  currency: CurrencyCode;
  can: (permission: Permission) => boolean;
}

/** All ACTIVE memberships of the current user (validated by RLS and an explicit user filter). */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations!inner(id, name, slug, deleted_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("organizations.deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load memberships: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    const org = row.organizations as unknown as { id: string; name: string; slug: string } | null;
    if (!org || !isRole(row.role)) return [];
    return [{ organizationId: org.id, organizationName: org.name, slug: org.slug, role: row.role }];
  });
});

/**
 * Resolves and VALIDATES the active organization for this request.
 * The `pm_org` cookie is only a hint: it is accepted only if the user has an
 * active membership in that organization; otherwise we fall back to the last
 * used or first organization. Returns null when the user has none yet.
 */
export const getOrganizationContext = cache(async (): Promise<OrganizationContext | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const [memberships, profileResult, cookieStore] = await Promise.all([
    getMemberships(),
    supabase.from("profiles").select("id, email, full_name, locale, timezone, last_organization_id").eq("id", user.id).single(),
    cookies(),
  ]);
  if (profileResult.error) throw new Error(`Failed to load profile: ${profileResult.error.message}`);
  const profile = profileResult.data;

  const activeId = resolveActiveOrganizationId({
    requested: cookieStore.get(ACTIVE_ORG_COOKIE)?.value,
    lastUsed: profile.last_organization_id,
    memberIds: memberships.map((m) => m.organizationId),
  });
  if (!activeId) return null;
  const membership = memberships.find((m) => m.organizationId === activeId);
  if (!membership) return null;

  const [orgResult, settingsResult] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", activeId).single(),
    supabase.from("organization_settings").select("*").eq("organization_id", activeId).single(),
  ]);
  if (orgResult.error) throw new Error(`Failed to load organization: ${orgResult.error.message}`);
  if (settingsResult.error) throw new Error(`Failed to load organization settings: ${settingsResult.error.message}`);

  const role = membership.role;
  return {
    user,
    profile,
    organization: orgResult.data,
    settings: settingsResult.data,
    role,
    memberships,
    locale: isLocale(profile.locale) ? profile.locale : "ro",
    currency: settingsResult.data.default_currency as CurrencyCode,
    can: (permission: Permission) => can(role, permission),
  };
});

/** For pages: requires a user AND an organization (else → login / onboarding). */
export async function requireOrganizationContext(): Promise<OrganizationContext> {
  await requireUser();
  const ctx = await getOrganizationContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}

/** For pages: additionally requires a permission (else → access denied page). */
export async function requirePagePermission(permission: Permission): Promise<OrganizationContext> {
  const ctx = await requireOrganizationContext();
  if (!ctx.can(permission)) redirect("/dashboard/forbidden");
  return ctx;
}

/**
 * For Server Actions: returns the context or throws PermissionError. The
 * database re-checks the same permission through RLS, so this is a fail-fast
 * layer, not the only one.
 */
export async function getActionContext(permission?: Permission): Promise<OrganizationContext | null> {
  const ctx = await getOrganizationContext();
  if (!ctx) return null;
  if (permission && !ctx.can(permission)) throw new PermissionError(permission);
  return ctx;
}

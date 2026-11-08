import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { assignableRoles } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { logger } from "@/lib/security/logger";
import { isLocale, toSupportedTimezone, type Locale } from "@/config/site";
import { OrganizationSettingsForm, RegionalSettingsPanel } from "@/features/settings/components/settings-forms";
import { LogoUploader } from "@/features/settings/components/logo-uploader";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { MembersPanel } from "@/features/settings/components/members-panel";
import { listMembers, listPendingInvitations } from "@/features/settings/services/members-service";
import { DeleteOrganizationCard } from "@/features/settings/components/delete-organization-card";
import { InviteMemberForm } from "@/features/organizations/components/invite-member-form";

export const metadata: Metadata = { title: "Settings" };

const TABS = ["organization", "regional", "members", "profile"] as const;
type Tab = (typeof TABS)[number];

export default async function SettingsPage({ searchParams }: PageProps<"/dashboard/settings">) {
  const ctx = await requireOrganizationContext();
  const { t } = await getI18n();
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.find((x) => x === requested) ?? "organization";
  const supabase = await createClient();
  const canEditOrg = ctx.can("org.update");
  const canManageSettings = ctx.can("settings.manage");
  const canManageMembers = ctx.can("members.manage");

  const [members, invitations, logoUrl] = await Promise.all([
    ctx.can("members.read") ? listMembers(supabase, ctx.organization.id) : Promise.resolve([]),
    canManageMembers ? listPendingInvitations(supabase, ctx.organization.id) : Promise.resolve([]),
    signedLogoUrl(supabase, ctx.organization.logo_path),
  ]);

  const o = ctx.organization;
  const readOnlyNote = <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t.settings.readOnly}</p>;

  return (
    <>
      <PageHeader title={t.settings.title} description={t.settings.description} />
      <Tabs key={tab} defaultValue={tab}>
        <TabsList>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t.settings.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.tabs.organization}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {!canEditOrg ? readOnlyNote : null}
              <LogoUploader logoUrl={logoUrl} canEdit={canManageSettings && canEditOrg} organizationName={o.name} />
              <OrganizationSettingsForm
                canEdit={canEditOrg}
                defaults={{
                  name: o.name,
                  legalName: o.legal_name ?? "",
                  taxId: o.tax_id ?? "",
                  registrationNumber: o.registration_number ?? "",
                  email: o.email ?? "",
                  phone: o.phone ?? "",
                  addressLine1: o.address_line1 ?? "",
                  city: o.city ?? "",
                  postalCode: o.postal_code ?? "",
                }}
              />
              {ctx.role === "owner" ? <DeleteOrganizationCard slug={o.slug} organizationName={o.name} /> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regional">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.tabs.regional}</CardTitle>
            </CardHeader>
            <CardContent>
              {!canManageSettings ? readOnlyNote : null}
              <RegionalSettingsPanel
                canEdit={canManageSettings}
                defaults={{
                  countryCode: o.country_code,
                  currency: ctx.currency,
                  locale: (isLocale(ctx.settings.default_locale) ? ctx.settings.default_locale : "ro") as Locale,
                  timezone: toSupportedTimezone(ctx.settings.timezone),
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.members}</CardTitle>
              {!canManageMembers ? <CardDescription>{t.settings.readOnly}</CardDescription> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
              {canManageMembers ? <InviteMemberForm assignableRoles={assignableRoles(ctx.role)} /> : null}
              <MembersPanel
                members={members}
                invitations={invitations}
                currentUserId={ctx.user.id}
                canManage={canManageMembers}
                assignableRoles={assignableRoles(ctx.role)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>{t.profile.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm
                email={ctx.profile.email}
                defaults={{
                  fullName: ctx.profile.full_name,
                  locale: isLocale(ctx.profile.locale) ? ctx.profile.locale : "ro",
                  timezone: toSupportedTimezone(ctx.profile.timezone),
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

async function signedLogoUrl(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("organization-assets").createSignedUrl(path, 60 * 60);
  if (error) {
    logger.warn("logo.signed_url_failed", { message: error.message });
    return null;
  }
  return data.signedUrl;
}

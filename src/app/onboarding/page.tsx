import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/features/i18n/components/language-switcher";
import { OrganizationStep } from "@/features/organizations/components/onboarding/organization-step";
import { CompanyStep } from "@/features/organizations/components/onboarding/company-step";
import { RegionalStep } from "@/features/organizations/components/onboarding/regional-step";
import { TeamStep } from "@/features/organizations/components/onboarding/team-step";
import { CustomerStep, ProjectStep } from "@/features/organizations/components/onboarding/record-steps";
import { wizardPosition } from "@/features/organizations/services/onboarding";
import { listCustomerOptions } from "@/features/customers/services/customer-service";
import { requireUser } from "@/lib/auth/session";
import { getOrganizationContext } from "@/lib/auth/organization-context";
import { assignableRoles } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";
import { toSupportedTimezone, type Locale } from "@/config/site";

export const metadata: Metadata = { title: "Onboarding" };

const WIZARD_STEPS = ["organization", "company", "regional", "team", "customer", "project"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Resumable onboarding: the current step is derived from the DATABASE
 * (does the user have an organization? what is organization_settings.onboarding_step?),
 * so leaving halfway and coming back continues where the user stopped.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  await requireUser("/onboarding");
  const { t } = await getI18n();
  const params = await searchParams;
  const wantsNewOrganization = params.new === "1";
  const ctx = await getOrganizationContext();

  let step: WizardStep = "organization";
  if (ctx && !wantsNewOrganization) {
    if (ctx.settings.onboarding_step === "completed" || !ctx.can("settings.manage")) redirect("/dashboard");
    step = ctx.settings.onboarding_step as WizardStep;
  }

  const position = wizardPosition(step);
  const titles: Record<WizardStep, { title: string; description: string }> = {
    organization: t.onboarding.organization,
    company: t.onboarding.company,
    regional: t.onboarding.regional,
    team: t.onboarding.team,
    customer: t.onboarding.customer,
    project: t.onboarding.project,
  };

  let body: React.ReactNode;
  if (step === "organization" || !ctx) {
    body = <OrganizationStep />;
  } else if (step === "company") {
    const o = ctx.organization;
    body = (
      <CompanyStep
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
    );
  } else if (step === "regional") {
    body = (
      <RegionalStep
        defaults={{
          countryCode: ctx.organization.country_code,
          currency: ctx.currency,
          locale: ctx.settings.default_locale as Locale,
          timezone: toSupportedTimezone(ctx.settings.timezone),
        }}
      />
    );
  } else if (step === "team") {
    body = <TeamStep assignableRoles={assignableRoles(ctx.role)} />;
  } else if (step === "customer") {
    body = <CustomerStep />;
  } else {
    const supabase = await createClient();
    const customers = await listCustomerOptions(supabase, ctx.organization.id);
    body = <ProjectStep customers={customers} defaultCurrency={ctx.currency} />;
  }

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo href={ctx ? "/dashboard" : "/"} />
        <LanguageSwitcher />
      </header>
      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[14rem_1fr]">
        <aside aria-label={t.onboarding.title}>
          <p className="mb-3 text-sm font-medium text-muted-foreground">{interpolate(t.onboarding.stepOf, { current: position, total: WIZARD_STEPS.length })}</p>
          <ol className="flex gap-2 overflow-x-auto lg:flex-col">
            {WIZARD_STEPS.map((s, index) => {
              const done = index + 1 < position;
              const current = index + 1 === position;
              return (
                <li
                  key={s}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                    current ? "bg-surface font-medium text-foreground shadow-xs" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border text-xs",
                      done ? "border-primary bg-primary text-white" : current ? "border-primary text-primary" : "border-border",
                    )}
                  >
                    {done ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="hidden sm:inline">{t.onboarding.steps[s]}</span>
                </li>
              );
            })}
          </ol>
        </aside>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{titles[step].title}</CardTitle>
            <CardDescription>{titles[step].description}</CardDescription>
          </CardHeader>
          <CardContent>{body}</CardContent>
        </Card>
      </main>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { CompanyDetailsForm } from "@/features/organizations/components/onboarding/company-step";
import { RegionalSettingsForm } from "@/features/organizations/components/onboarding/regional-step";
import type { CompanyDetailsInput, RegionalSettingsInput } from "@/features/organizations/schemas/organization";

export function OrganizationSettingsForm({ defaults, canEdit }: { defaults: CompanyDetailsInput; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <CompanyDetailsForm
      defaults={defaults}
      disabled={!canEdit}
      submitLabel={t.common.save}
      onSaved={() => {
        toast.success(t.settings.organizationSaved);
        router.refresh();
      }}
    />
  );
}

export function RegionalSettingsPanel({ defaults, canEdit }: { defaults: RegionalSettingsInput; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <RegionalSettingsForm
      defaults={defaults}
      disabled={!canEdit}
      submitLabel={t.common.save}
      onSaved={() => {
        toast.success(t.settings.regionalSaved);
        router.refresh();
      }}
    />
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyCode } from "@/config/site";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/forms/form-field";
import { useI18n } from "@/lib/i18n/client";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { ProjectForm } from "@/features/projects/components/project-form";
import { completeOnboardingStepAction } from "../../actions/organization-actions";

function useStepCompletion(step: "customer" | "project", after: () => void) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const complete = () =>
    startTransition(async () => {
      const result = await completeOnboardingStepAction(step);
      if (!result.ok) {
        setError(actionErrorMessage(t, result.error));
        return;
      }
      after();
    });
  return { complete, pending, error };
}

export function CustomerStep() {
  const { t } = useI18n();
  const router = useRouter();
  const { complete, pending, error } = useStepCompletion("customer", () => router.refresh());
  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <CustomerForm
        submitLabel={t.common.continue}
        onSuccess={complete}
        secondaryAction={
          <Button variant="ghost" onClick={complete} disabled={pending}>
            {t.common.skip}
          </Button>
        }
      />
    </div>
  );
}

export function ProjectStep({ customers, defaultCurrency }: { customers: { id: string; name: string }[]; defaultCurrency: CurrencyCode }) {
  const { t } = useI18n();
  const router = useRouter();
  const { complete, pending, error } = useStepCompletion("project", () => {
    router.push("/dashboard");
    router.refresh();
  });
  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <ProjectForm
        customers={customers}
        defaultCurrency={defaultCurrency}
        defaultCustomerId={customers[0]?.id}
        submitLabel={t.onboarding.finish}
        onSuccess={complete}
        secondaryAction={
          <Button variant="ghost" onClick={complete} disabled={pending}>
            {t.common.skip}
          </Button>
        }
      />
    </div>
  );
}

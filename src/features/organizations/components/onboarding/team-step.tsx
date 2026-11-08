"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/forms/form-field";
import { useI18n } from "@/lib/i18n/client";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { Role } from "@/lib/permissions";
import { completeOnboardingStepAction } from "../../actions/organization-actions";
import { InviteMemberForm } from "../invite-member-form";

export function TeamStep({ assignableRoles }: { assignableRoles: Role[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function finish() {
    startTransition(async () => {
      const result = await completeOnboardingStepAction("team");
      if (!result.ok) {
        setError(actionErrorMessage(t, result.error));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <InviteMemberForm assignableRoles={assignableRoles} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="primary" onClick={finish} loading={pending}>
          {t.common.continue}
        </Button>
      </div>
    </div>
  );
}

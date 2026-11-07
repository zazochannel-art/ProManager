"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/forms/form-field";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { acceptInvitationAction } from "../actions/organization-actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {failed ? <FormAlert>{t.invitation.invalid}</FormAlert> : null}
      <Button
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (!result.ok) {
              setFailed(true);
              return;
            }
            toast.success(t.invitation.accepted);
            router.push("/dashboard");
            router.refresh();
          })
        }
      >
        {t.invitation.accept}
      </Button>
    </div>
  );
}

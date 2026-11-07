"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { toast } from "@/components/ui/toast";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { Role } from "@/lib/permissions";
import { inviteMemberAction } from "../actions/organization-actions";
import { inviteMemberSchema, type InviteMemberInput } from "../schemas/organization";

export function InviteMemberForm({ assignableRoles }: { assignableRoles: Role[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const roles = assignableRoles.filter((r) => r !== "owner");
  const [result, setResult] = useState<{ email: string; emailSent: boolean; inviteUrl?: string } | null>(null);
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: roles.includes("employee") ? "employee" : (roles[0] ?? "viewer") },
  });
  const { submit, pending, formError } = useActionForm(form, inviteMemberAction, {
    onSuccess: (data) => {
      setResult(data);
      form.reset({ email: "", role: form.getValues("role") });
      router.refresh();
    },
  });
  const errors = form.formState.errors;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <FormField label={t.onboarding.team.email} error={translateValidationMessage(t, errors.email?.message)}>
          <Input type="email" inputMode="email" autoComplete="off" {...form.register("email")} />
        </FormField>
        <FormField label={t.onboarding.team.role} error={translateValidationMessage(t, errors.role?.message)}>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t.roles[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <Button type="submit" loading={pending} variant="secondary">
          {t.onboarding.team.add}
        </Button>
      </form>
      {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
      {result ? (
        <FormAlert tone={result.emailSent ? "success" : "info"}>
          <p>{interpolate(t.onboarding.team.invited, { email: result.email })}</p>
          {result.emailSent ? (
            <p>{t.onboarding.team.emailSent}</p>
          ) : result.inviteUrl ? (
            <div className="mt-2 flex flex-col gap-2">
              <p>{t.onboarding.team.emailNotConfigured}</p>
              <div className="flex gap-2">
                <Input readOnly value={result.inviteUrl} aria-label={t.onboarding.team.emailNotConfigured} className="font-mono text-xs" />
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(result.inviteUrl ?? "");
                      toast.success(t.settings.inviteLinkCopied);
                    } catch {
                      toast.error(t.common.genericError);
                    }
                  }}
                >
                  <Copy aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}
        </FormAlert>
      ) : null}
    </div>
  );
}

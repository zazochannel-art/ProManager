"use client";

import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";
import { voidSchema, type VoidInput } from "../schemas/document";
import { useRouter } from "next/navigation";

/** Destructive step that needs a written reason (voiding an invoice or a payment). */
export function ReasonDialog({
  trigger,
  title,
  description,
  label,
  confirmLabel,
  successMessage,
  action,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  successMessage: string;
  action: (values: VoidInput) => Promise<ActionResult<unknown>>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<VoidInput>({ resolver: zodResolver(voidSchema), defaultValues: { reason: "" } });
  const { submit, pending, formError } = useActionForm(form, action, {
    onSuccess: () => {
      setOpen(false);
      form.reset({ reason: "" });
      toast.success(successMessage);
      router.refresh();
    },
  });
  const error = formError && !formError.ok ? (formError.error === "validation" && !formError.fieldErrors ? t.invoicing.stateError : formError.error !== "validation" ? actionErrorMessage(t, formError.error) : null) : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <FormField label={label} error={translateValidationMessage(t, form.formState.errors.reason?.message)}>
            <Textarea rows={3} {...form.register("reason")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

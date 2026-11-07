"use client";

import { useState, useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { ActionResult } from "@/lib/validation/action-result";

/**
 * Bridges React Hook Form and a Server Action returning ActionResult:
 * runs the action in a transition, maps server field errors back onto the
 * form, and exposes a form-level error code. Errors are never swallowed.
 */
export function useActionForm<TValues extends FieldValues, TData>(
  form: UseFormReturn<TValues>,
  action: (values: TValues) => Promise<ActionResult<TData>>,
  options: { onSuccess?: (data: TData) => void } = {},
) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<ActionResult<TData> | null>(null);

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      let result: ActionResult<TData>;
      try {
        result = await action(values);
      } catch (error) {
        // Redirects thrown by server actions must propagate.
        if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw error;
        }
        console.error("server_action_failed", error instanceof Error ? error.message : error);
        result = { ok: false, error: "server" };
      }
      if (result.ok) {
        options.onSuccess?.(result.data);
        return;
      }
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          if (field !== "_form") form.setError(field as Path<TValues>, { type: "server", message });
        }
      }
      setFormError(result);
    });
  });

  return { submit, pending, formError, clearFormError: () => setFormError(null) };
}

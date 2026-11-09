"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";

/**
 * Like useRunAction, but a "validation" failure of a workflow step (for
 * example issuing an invoice that was issued meanwhile in another tab) is
 * explained as a document state problem instead of a generic error.
 */
export function useDocumentAction() {
  const { t } = useI18n();
  const router = useRouter();
  return async function run<T>(action: () => Promise<ActionResult<T>>, successMessage: string, options: { redirectTo?: (data: T) => string } = {}) {
    let result: ActionResult<T>;
    try {
      result = await action();
    } catch (error) {
      console.error("server_action_failed", error instanceof Error ? error.message : error);
      result = { ok: false, error: "server" };
    }
    if (!result.ok) {
      toast.error(result.error === "validation" ? t.invoicing.stateError : actionErrorMessage(t, result.error));
      router.refresh();
      return false;
    }
    toast.success(successMessage);
    if (options.redirectTo) router.push(options.redirectTo(result.data));
    else router.refresh();
    return true;
  };
}

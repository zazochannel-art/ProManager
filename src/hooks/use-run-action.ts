"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";

/**
 * Runs a one-shot Server Action (archive, delete, status change) and reports
 * the outcome with a toast. Returns true on success. Errors are always shown.
 */
export function useRunAction() {
  const { t } = useI18n();
  const router = useRouter();
  return async function run<T>(action: () => Promise<ActionResult<T>>, successMessage: string, options: { redirectTo?: string } = {}) {
    let result: ActionResult<T>;
    try {
      result = await action();
    } catch (error) {
      console.error("server_action_failed", error instanceof Error ? error.message : error);
      result = { ok: false, error: "server" };
    }
    if (!result.ok) {
      toast.error(actionErrorMessage(t, result.error));
      return false;
    }
    toast.success(successMessage);
    if (options.redirectTo) router.push(options.redirectTo);
    else router.refresh();
    return true;
  };
}

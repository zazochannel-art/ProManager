import type { Dictionary } from "@/lib/i18n";
import type { ActionErrorCode } from "./action-result";

/** Localized, user-facing message for a Server Action error code. */
export function actionErrorMessage(t: Dictionary, code: ActionErrorCode): string {
  switch (code) {
    case "forbidden":
      return t.errors.forbiddenBody;
    case "rate_limited":
      return t.auth.errors.rateLimited;
    case "unauthenticated":
      return t.auth.errors.generic;
    case "limit_reached":
      return t.errors.limitReached;
    case "conflict":
      return t.errors.conflict;
    case "not_found":
      return t.errors.notFound;
    default:
      return t.common.genericError;
  }
}

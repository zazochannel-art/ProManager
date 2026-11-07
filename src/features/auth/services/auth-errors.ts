import type { Dictionary } from "@/lib/i18n";

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "weak_password"
  | "email_taken"
  | "link_invalid"
  | "generic";

/** Maps Supabase Auth error codes (AuthApiError.code) to our stable codes. */
export function mapSupabaseAuthError(error: { code?: string | null; status?: number } | null | undefined): AuthErrorCode {
  switch (error?.code) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rate_limited";
    case "weak_password":
      return "weak_password";
    case "user_already_exists":
    case "email_exists":
      return "email_taken";
    case "otp_expired":
    case "flow_state_expired":
    case "bad_jwt":
      return "link_invalid";
    default:
      return error?.status === 429 ? "rate_limited" : "generic";
  }
}

export function authErrorMessage(t: Dictionary, code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return t.auth.errors.invalidCredentials;
    case "email_not_confirmed":
      return t.auth.errors.emailNotConfirmed;
    case "rate_limited":
      return t.auth.errors.rateLimited;
    case "weak_password":
      return t.auth.errors.weakPassword;
    case "email_taken":
      return t.auth.errors.emailTaken;
    case "link_invalid":
      return t.auth.errors.linkInvalid;
    default:
      return t.auth.errors.generic;
  }
}

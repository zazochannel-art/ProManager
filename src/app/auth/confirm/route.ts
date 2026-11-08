import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/routes";
import { logger } from "@/lib/security/logger";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * E-mail link handler (sign-up confirmation, password recovery, e-mail change).
 * Supabase e-mail templates must link to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>
 * See docs/deployment.md. A PKCE `code` is also accepted.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const fallback = type === "recovery" ? "/reset-password" : "/onboarding";
  const next = safeRedirectPath(searchParams.get("next"), fallback);

  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    logger.warn("auth.confirm_failed", { code: error.code, type });
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    logger.warn("auth.code_exchange_failed", { code: error.code });
  }

  return NextResponse.redirect(new URL("/login?error=link_invalid", request.url));
}

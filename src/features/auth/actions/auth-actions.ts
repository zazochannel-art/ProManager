"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE } from "@/config/site";
import { getPublicEnv } from "@/config/env";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/routes";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { logger } from "@/lib/security/logger";
import { getRequestLocale } from "@/lib/i18n/server";
import { fail, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../schemas/auth";
import { mapSupabaseAuthError, type AuthErrorCode } from "../services/auth-errors";

type AuthResult<T = undefined> = ActionResult<T> & { authError?: AuthErrorCode };

export async function signInAction(input: unknown, nextPath?: string): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const ip = await getClientIp();
  const byIp = checkRateLimit("signIn", ip);
  const byEmail = checkRateLimit("signIn", parsed.data.email);
  if (!byIp.allowed || !byEmail.allowed) return { ...fail("rate_limited"), authError: "rate_limited" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const code = mapSupabaseAuthError(error);
    if (code === "generic") logger.warn("auth.sign_in_failed", { code: error.code, status: error.status });
    return { ...fail("unauthenticated"), authError: code };
  }
  redirect(safeRedirectPath(nextPath));
}

export async function signUpAction(input: unknown): Promise<AuthResult<{ email: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const ip = await getClientIp();
  if (!checkRateLimit("signUp", ip).allowed) return { ...fail("rate_limited"), authError: "rate_limited" };

  const locale = parsed.data.locale ?? (await getRequestLocale());
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/onboarding`,
      // Profile defaults only — never used for authorization.
      data: { full_name: parsed.data.fullName, locale },
    },
  });
  if (error) {
    const code = mapSupabaseAuthError(error);
    if (code === "generic") logger.warn("auth.sign_up_failed", { code: error.code, status: error.status });
    return { ...fail(code === "rate_limited" ? "rate_limited" : "validation"), authError: code };
  }
  // Same response whether or not the address was already registered (no account enumeration).
  return ok({ email: parsed.data.email });
}

export async function requestPasswordResetAction(input: unknown): Promise<AuthResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const ip = await getClientIp();
  if (!checkRateLimit("passwordReset", ip).allowed || !checkRateLimit("passwordReset", parsed.data.email).allowed) {
    return { ...fail("rate_limited"), authError: "rate_limited" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });
  if (error) {
    const code = mapSupabaseAuthError(error);
    if (code === "rate_limited") return { ...fail("rate_limited"), authError: code };
    logger.warn("auth.reset_request_failed", { code: error.code, status: error.status });
  }
  // Always succeed from the user's perspective (no account enumeration).
  return ok(undefined);
}

export async function updatePasswordAction(input: unknown): Promise<AuthResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ...fail("unauthenticated"), authError: "link_invalid" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const code = mapSupabaseAuthError(error);
    logger.warn("auth.update_password_failed", { code: error.code, status: error.status });
    return { ...fail("validation"), authError: code };
  }
  return ok(undefined);
}

export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logger.warn("auth.sign_out_failed", { code: error.code });
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  redirect("/login");
}

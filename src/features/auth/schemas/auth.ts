import { z } from "zod";
import { emailField, localeField, requiredText } from "@/lib/validation/common";

/**
 * Password policy: ≥ 10 chars, at least one letter and one digit, ≤ 72 bytes
 * (bcrypt limit used by Supabase Auth). Configure the same minimum in the
 * Supabase dashboard (Auth → Providers → Email) so both layers agree.
 */
export const passwordField = z
  .string({ error: "required" })
  .min(1, { error: "required" })
  .min(10, { error: "passwordWeak" })
  .refine((v) => new TextEncoder().encode(v).length <= 72, { error: "maxLength:72" })
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), { error: "passwordWeak" });

export const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: "required" }).min(1, { error: "required" }).max(200, { error: "maxLength:200" }),
});

export const registerSchema = z
  .object({
    fullName: requiredText(2, 120),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string({ error: "required" }).min(1, { error: "required" }),
    locale: localeField.optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], error: "passwordsMismatch" });

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string({ error: "required" }).min(1, { error: "required" }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], error: "passwordsMismatch" });

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

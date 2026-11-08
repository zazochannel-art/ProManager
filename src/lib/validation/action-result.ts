import type { z } from "zod";

/**
 * Uniform result of every Server Action. Errors are machine-readable codes;
 * the UI maps them to translated messages. Nothing is swallowed silently.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; fieldErrors?: Record<string, string>; message?: string };

export type ActionErrorCode =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "limit_reached"
  | "server";

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: ActionErrorCode, extra?: { fieldErrors?: Record<string, string>; message?: string }): ActionResult<never> {
  return { ok: false, error, ...extra };
}

/** Flattens Zod issues into { field: messageKey } (first issue per field). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export function validationFailure(error: z.ZodError): ActionResult<never> {
  return fail("validation", { fieldErrors: zodFieldErrors(error) });
}

/** Maps PostgreSQL / PostgREST error codes raised by our functions and RLS. */
export function mapDatabaseError(error: { code?: string; message?: string } | null | undefined): ActionErrorCode {
  switch (error?.code) {
    case "42501": // insufficient_privilege (RLS / explicit checks)
      return "forbidden";
    case "28000":
      return "unauthenticated";
    case "23505": // unique_violation
      return "conflict";
    case "54000": // program_limit_exceeded (plan limits)
      return "limit_reached";
    case "PGRST116":
      return "not_found";
    case "23503":
    case "23514":
    case "22023":
    case "22P02":
      return "validation";
    default:
      return "server";
  }
}

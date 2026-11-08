/** Route classification shared by the proxy and server guards. */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"] as const;
const AUTH_ONLY_PREFIXES = ["/login", "/register", "/forgot-password"] as const;

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matches(pathname, p));
}

/** Pages that make no sense for a signed-in user (they get sent to the dashboard). */
export function isAuthOnlyPath(pathname: string): boolean {
  return AUTH_ONLY_PREFIXES.some((p) => matches(pathname, p));
}

/**
 * Accepts only same-origin relative paths for post-login redirects, which
 * prevents open-redirect attacks via ?next=https://evil.example.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

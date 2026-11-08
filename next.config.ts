import type { NextConfig } from "next";

/**
 * Cache Components is intentionally disabled: nearly every route in ProManager
 * is per-user and per-organization (Supabase session cookies + RLS), so pages
 * render dynamically on each request. See docs/architecture.md.
 */
/**
 * Content-Security-Policy. Only our own origin and the Supabase project may be
 * contacted. Next.js injects small inline bootstrap scripts, so script-src
 * keeps 'unsafe-inline' until nonce-based CSP is added in the proxy; styles
 * need it for Radix/Recharts inline styles. 'unsafe-eval' only in dev (HMR).
 */
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : "";
  const isDev = process.env.NODE_ENV !== "production";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase].filter(Boolean),
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, supabaseWs, ...(isDev ? ["ws:"] : [])].filter(Boolean),
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

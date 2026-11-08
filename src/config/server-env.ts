import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Importing this module from a Client Component fails the
 * build (`server-only`), which keeps the secret key out of browser bundles.
 */
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  /** Number of trusted reverse proxies in front of the app (see src/lib/security/request.ts). */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS || undefined,
  });
  if (!parsed.success) {
    throw new Error("Invalid server environment configuration. See .env.example.");
  }
  return parsed.data;
}

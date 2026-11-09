import { z } from "zod";
import { emailField, uuidField } from "@/lib/validation/common";

/** How long a portal link stays valid, in days. */
export const PORTAL_VALIDITY_DAYS = [30, 90, 180, 365] as const;
export type PortalValidity = (typeof PORTAL_VALIDITY_DAYS)[number];

export const portalAccessSchema = z
  .object({
    customerId: uuidField,
    email: emailField,
    canViewInvoices: z.boolean().default(true),
    canViewEstimates: z.boolean().default(true),
    canViewProjects: z.boolean().default(true),
    validDays: z.coerce
      .number()
      .refine((v): v is PortalValidity => (PORTAL_VALIDITY_DAYS as readonly number[]).includes(v), { error: "invalidOption" }),
  })
  .refine((v) => v.canViewInvoices || v.canViewEstimates || v.canViewProjects, { error: "portalNothingShared", path: ["canViewInvoices"] });
export type PortalAccessInput = z.input<typeof portalAccessSchema>;

export type PortalAccessStatus = "active" | "expired" | "revoked";

export function portalAccessStatus(row: { revoked_at: string | null; expires_at: string }, now: Date = new Date()): PortalAccessStatus {
  if (row.revoked_at) return "revoked";
  return new Date(row.expires_at).getTime() <= now.getTime() ? "expired" : "active";
}

/** Portal tokens are 32 random bytes in base64url (43 characters, no padding). */
export const isPortalToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

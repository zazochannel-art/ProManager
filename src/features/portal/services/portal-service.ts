import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/security/logger";
import { add, toFixed } from "@/lib/calculations/decimal";
import { hashInvitationToken } from "@/features/organizations/services/invitation-token";
import {
  getCustomerParty,
  listDocumentLines,
  partyFromCustomerSnapshot,
  partyFromOrganization,
  type DocumentLine,
  type PrintParty,
} from "@/features/invoicing/services/invoicing-service";
import type { EstimateStatus, InvoiceStatus } from "@/features/invoicing/schemas/document";
import { isPortalToken, portalAccessStatus } from "../schemas/portal";
import { interpolate } from "@/lib/i18n";
import { notifyLater } from "@/features/notifications/services/notify";

/**
 * Customer-facing reads for the client portal.
 *
 * Customers have no account, so these queries run with the server-only secret
 * key (RLS bypassed). Every query is therefore scoped here, explicitly, to the
 * organization AND customer of a portal access row that was found by the
 * SHA-256 hash of the link token, is not revoked and has not expired. Drafts
 * and voided documents are never shown, and each section obeys its
 * can_view_* flag.
 */

type Admin = ReturnType<typeof createAdminClient>;
type JsonRecord = Record<string, unknown>;

/** Statuses a customer may see: never drafts (nor voided invoices). */
export const PORTAL_INVOICE_STATUSES = ["issued", "partially_paid", "paid"] as const satisfies readonly InvoiceStatus[];
export const PORTAL_ESTIMATE_STATUSES = ["sent", "accepted", "rejected", "expired", "converted"] as const satisfies readonly EstimateStatus[];

export interface PortalAccess {
  id: string;
  organizationId: string;
  customerId: string;
  customerName: string;
  email: string;
  canViewInvoices: boolean;
  canViewEstimates: boolean;
  canViewProjects: boolean;
  canViewDocuments: boolean;
  expiresAt: string;
  organization: JsonRecord & { name: string };
}

export type PortalResolution = { status: "ok"; access: PortalAccess; admin: Admin } | { status: "invalid" | "expired" | "revoked" | "unavailable" };

/** Touch last_accessed_at at most every 10 minutes. */
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

function adminClient(): Admin | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Looks up the access row for a link token. Cached per request (layout and page share it). */
export const resolvePortalAccess = cache(async (token: string): Promise<PortalResolution> => {
  if (!isPortalToken(token)) return { status: "invalid" };
  const admin = adminClient();
  if (!admin) {
    logger.error("portal.unavailable", { reason: "SUPABASE_SECRET_KEY missing" });
    return { status: "unavailable" };
  }
  const { data: row, error } = await admin
    .from("client_portal_access")
    .select("id, organization_id, customer_id, email, can_view_invoices, can_view_estimates, can_view_projects, can_view_documents, expires_at, revoked_at, last_accessed_at, created_by")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();
  if (error) throw new Error(`Failed to load portal access: ${error.message}`);
  if (!row) return { status: "invalid" };
  const status = portalAccessStatus(row);
  if (status !== "active") return { status };

  const [organization, customer] = await Promise.all([
    admin
      .from("organizations")
      .select("name, legal_name, tax_id, registration_number, email, phone, website, address_line1, address_line2, city, postal_code, country_code, deleted_at")
      .eq("id", row.organization_id)
      .maybeSingle(),
    admin.from("customers").select("name, deleted_at").eq("organization_id", row.organization_id).eq("id", row.customer_id).maybeSingle(),
  ]);
  if (organization.error) throw new Error(`Failed to load organization: ${organization.error.message}`);
  if (customer.error) throw new Error(`Failed to load customer: ${customer.error.message}`);
  // An archived company or customer closes the portal too.
  if (!organization.data || organization.data.deleted_at || !customer.data || customer.data.deleted_at) return { status: "revoked" };

  if (!row.last_accessed_at || Date.now() - new Date(row.last_accessed_at).getTime() > TOUCH_INTERVAL_MS) {
    let touch = admin.from("client_portal_access").update({ last_accessed_at: new Date().toISOString() }).eq("id", row.id);
    // On the first visit, only the request that sets the time sends the notification.
    if (!row.last_accessed_at) touch = touch.is("last_accessed_at", null);
    const touched = await touch.select("id");
    if (touched.error) logger.warn("portal.touch_failed", { error: touched.error.message });
    // The first visit tells whoever shared the link.
    if (!row.last_accessed_at && touched.data?.length === 1 && row.created_by) {
      const customerName = customer.data.name;
      const email = row.email;
      notifyLater({
        organizationId: row.organization_id,
        event: "portal.opened",
        userIds: [row.created_by],
        link: "/dashboard/client-portal",
        message: (t) => ({
          title: interpolate(t.notifications.events["portal.opened"].title, { customer: customerName }),
          body: interpolate(t.notifications.events["portal.opened"].body, { email }),
        }),
      });
    }
  }

  return {
    status: "ok",
    admin,
    access: {
      id: row.id,
      organizationId: row.organization_id,
      customerId: row.customer_id,
      customerName: customer.data.name,
      email: row.email,
      canViewInvoices: row.can_view_invoices,
      canViewEstimates: row.can_view_estimates,
      canViewProjects: row.can_view_projects,
      canViewDocuments: row.can_view_documents,
      expiresAt: row.expires_at,
      organization: organization.data as JsonRecord & { name: string },
    },
  };
});

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "0.00" : toFixed(v));

export interface PortalInvoiceRow {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  currency: string;
  issue_date: string;
  due_date: string | null;
  total: string;
  amount_paid: string;
  balance_due: string;
  is_overdue: boolean;
}

export interface PortalEstimateRow {
  id: string;
  number: string | null;
  title: string | null;
  status: EstimateStatus;
  currency: string;
  issue_date: string;
  valid_until: string | null;
  total: string;
}

export interface PortalProjectRow {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  site_address: string | null;
}

export interface PortalFileRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface PortalOverview {
  files: PortalFileRow[] | null;
  invoices: PortalInvoiceRow[] | null;
  estimates: PortalEstimateRow[] | null;
  projects: PortalProjectRow[] | null;
  /** Open balance per currency, and how many open invoices are overdue. */
  balance: Record<string, string>;
  overdue: number;
}

export async function getPortalOverview(admin: Admin, access: PortalAccess): Promise<PortalOverview> {
  const org = access.organizationId;
  const customer = access.customerId;
  const [invoices, estimates, projects, files] = await Promise.all([
    access.canViewInvoices
      ? admin
          .from("invoice_overview")
          .select("id, number, status, currency, issue_date, due_date, total, amount_paid, balance_due, is_overdue")
          .eq("organization_id", org)
          .eq("customer_id", customer)
          .in("status", [...PORTAL_INVOICE_STATUSES])
          .order("issue_date", { ascending: false })
          .limit(200)
      : null,
    access.canViewEstimates
      ? admin
          .from("estimates")
          .select("id, number, title, status, currency, issue_date, valid_until, total")
          .eq("organization_id", org)
          .eq("customer_id", customer)
          .in("status", [...PORTAL_ESTIMATE_STATUSES])
          .is("deleted_at", null)
          .order("issue_date", { ascending: false })
          .limit(200)
      : null,
    access.canViewProjects
      ? admin
          .from("projects")
          .select("id, name, status, start_date, end_date, site_address")
          .eq("organization_id", org)
          .eq("customer_id", customer)
          .neq("status", "cancelled")
          .is("deleted_at", null)
          .order("start_date", { ascending: false, nullsFirst: false })
          .limit(100)
      : null,
    access.canViewDocuments
      ? admin
          .from("documents")
          .select("id, file_name, mime_type, size_bytes, created_at")
          .eq("organization_id", org)
          .eq("customer_id", customer)
          .eq("is_client_visible", true)
          .eq("bucket", "documents")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200)
      : null,
  ]);
  for (const r of [invoices, estimates, projects, files]) if (r?.error) throw new Error(`Failed to load portal data: ${r.error.message}`);

  const invoiceRows: PortalInvoiceRow[] | null = invoices
    ? (invoices.data ?? []).flatMap((i) =>
        i.id && i.status && i.currency && i.issue_date
          ? [
              {
                id: i.id,
                number: i.number,
                status: i.status,
                currency: i.currency,
                issue_date: i.issue_date,
                due_date: i.due_date,
                total: str(i.total),
                amount_paid: str(i.amount_paid),
                balance_due: str(i.balance_due),
                is_overdue: i.is_overdue === true,
              },
            ]
          : [],
      )
    : null;
  const balance: Record<string, string> = {};
  let overdue = 0;
  for (const i of invoiceRows ?? []) {
    if (i.status === "paid" || Number(i.balance_due) <= 0) continue;
    balance[i.currency] = toFixed(add(balance[i.currency] ?? "0", i.balance_due));
    if (i.is_overdue) overdue += 1;
  }
  return {
    invoices: invoiceRows,
    estimates: estimates ? (estimates.data ?? []).map((e) => ({ ...e, total: str(e.total) })) : null,
    projects: projects ? (projects.data ?? []) : null,
    files: files ? (files.data ?? []) : null,
    balance,
    overdue,
  };
}

export interface PortalDocument {
  kind: "invoice" | "estimate";
  id: string;
  number: string | null;
  title: string | null;
  status: InvoiceStatus | EstimateStatus;
  currency: string;
  issue_date: string;
  /** Due date (invoice) or valid-until date (estimate). */
  end_date: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  amount_paid: string | null;
  balance_due: string | null;
  is_overdue: boolean;
  supplier: PrintParty;
  customer: PrintParty | null;
  lines: DocumentLine[];
}

const asRecord = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : null);

/** One invoice or estimate of this customer, or null when it is not theirs, a draft, voided or deleted. */
export async function getPortalDocument(admin: Admin, access: PortalAccess, kind: "invoice" | "estimate", id: string): Promise<PortalDocument | null> {
  const org = access.organizationId;
  // listDocumentLines/getCustomerParty only add organization + id filters; the document was verified to belong to this customer first.
  const asServer = admin as unknown as ServerSupabaseClient;
  if (kind === "invoice") {
    if (!access.canViewInvoices) return null;
    const [{ data: inv, error }, { data: snap, error: snapError }] = await Promise.all([
      admin
        .from("invoice_overview")
        .select("id, number, status, currency, issue_date, due_date, notes, terms, subtotal, discount_total, tax_total, total, amount_paid, balance_due, is_overdue")
        .eq("organization_id", org)
        .eq("customer_id", access.customerId)
        .eq("id", id)
        .in("status", [...PORTAL_INVOICE_STATUSES])
        .maybeSingle(),
      admin.from("invoices").select("customer_snapshot, organization_snapshot").eq("organization_id", org).eq("customer_id", access.customerId).eq("id", id).maybeSingle(),
    ]);
    if (error) throw new Error(`Failed to load invoice: ${error.message}`);
    if (snapError) throw new Error(`Failed to load invoice snapshots: ${snapError.message}`);
    if (!inv || !inv.id || !inv.status || !inv.currency || !inv.issue_date) return null;
    const lines = await listDocumentLines(asServer, org, "invoice", inv.id);
    const customerSnapshot = asRecord(snap?.customer_snapshot);
    return {
      kind,
      id: inv.id,
      number: inv.number,
      title: null,
      status: inv.status,
      currency: inv.currency,
      issue_date: inv.issue_date,
      end_date: inv.due_date,
      notes: inv.notes,
      terms: inv.terms,
      subtotal: str(inv.subtotal),
      discount_total: str(inv.discount_total),
      tax_total: str(inv.tax_total),
      total: str(inv.total),
      amount_paid: str(inv.amount_paid),
      balance_due: str(inv.balance_due),
      is_overdue: inv.is_overdue === true,
      supplier: partyFromOrganization(asRecord(snap?.organization_snapshot) ?? access.organization),
      customer: customerSnapshot ? partyFromCustomerSnapshot(customerSnapshot) : await getCustomerParty(asServer, org, access.customerId),
      lines,
    };
  }
  if (!access.canViewEstimates) return null;
  const { data: est, error } = await admin
    .from("estimates")
    .select("id, number, title, status, currency, issue_date, valid_until, notes, terms, subtotal, discount_total, tax_total, total")
    .eq("organization_id", org)
    .eq("customer_id", access.customerId)
    .eq("id", id)
    .in("status", [...PORTAL_ESTIMATE_STATUSES])
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load estimate: ${error.message}`);
  if (!est) return null;
  const [lines, customer] = await Promise.all([listDocumentLines(asServer, org, "estimate", est.id), getCustomerParty(asServer, org, access.customerId)]);
  return {
    kind,
    id: est.id,
    number: est.number,
    title: est.title,
    status: est.status,
    currency: est.currency,
    issue_date: est.issue_date,
    end_date: est.valid_until,
    notes: est.notes,
    terms: est.terms,
    subtotal: str(est.subtotal),
    discount_total: str(est.discount_total),
    tax_total: str(est.tax_total),
    total: str(est.total),
    amount_paid: null,
    balance_due: null,
    is_overdue: false,
    supplier: partyFromOrganization(access.organization),
    customer,
    lines,
  };
}

/** A one-minute download link for a file shared with this customer, or null when it is not theirs or not shared. */
export async function getPortalFileUrl(admin: Admin, access: PortalAccess, id: string): Promise<string | null> {
  if (!access.canViewDocuments) return null;
  const { data, error } = await admin
    .from("documents")
    .select("storage_path, file_name")
    .eq("organization_id", access.organizationId)
    .eq("customer_id", access.customerId)
    .eq("id", id)
    .eq("is_client_visible", true)
    .eq("bucket", "documents")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load document: ${error.message}`);
  if (!data) return null;
  const signed = await admin.storage.from("documents").createSignedUrl(data.storage_path, 60, { download: data.file_name });
  if (signed.error || !signed.data) return null;
  return signed.data.signedUrl;
}

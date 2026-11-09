import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { add, toFixed } from "@/lib/calculations/decimal";
import type { DocumentKind, EstimateStatus, InvoiceStatus } from "../schemas/document";

export const DOCUMENTS_PAGE_SIZE = 25;

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "0.00" : toFixed(v));

async function namesById(supabase: ServerSupabaseClient, table: "customers" | "projects", organizationId: string, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map<string, string>();
  const { data, error } = await supabase.from(table).select("id, name").eq("organization_id", organizationId).in("id", unique);
  if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.id, r.name]));
}

// --- Estimates ----------------------------------------------------------------

export const ESTIMATE_VIEWS = ["all", "draft", "sent", "accepted", "closed"] as const;
export type EstimateView = (typeof ESTIMATE_VIEWS)[number];

export interface EstimateListItem {
  id: string;
  number: string | null;
  title: string | null;
  status: EstimateStatus;
  customer_name: string | null;
  issue_date: string;
  valid_until: string | null;
  total: string;
  currency: string;
}

export async function listEstimates(
  supabase: ServerSupabaseClient,
  organizationId: string,
  options: { view?: EstimateView; page?: number; customerId?: string; pageSize?: number } = {},
): Promise<{ rows: EstimateListItem[]; total: number }> {
  const pageSize = options.pageSize ?? DOCUMENTS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * pageSize;
  let query = supabase
    .from("estimates")
    .select("id, number, title, status, customer_id, issue_date, valid_until, total, currency", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  switch (options.view) {
    case "draft":
    case "sent":
    case "accepted":
      query = query.eq("status", options.view);
      break;
    case "closed":
      query = query.in("status", ["converted", "rejected", "expired"]);
      break;
  }
  if (options.customerId) query = query.eq("customer_id", options.customerId);
  const { data, error, count } = await query
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Failed to list estimates: ${error.message}`);
  const customers = await namesById(supabase, "customers", organizationId, (data ?? []).map((r) => r.customer_id));
  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      status: r.status,
      customer_name: customers.get(r.customer_id) ?? null,
      issue_date: r.issue_date,
      valid_until: r.valid_until,
      total: str(r.total),
      currency: r.currency,
    })),
    total: count ?? 0,
  };
}

export interface EstimateDetail {
  id: string;
  number: string | null;
  title: string | null;
  status: EstimateStatus;
  customer_id: string;
  customer_name: string | null;
  project_id: string | null;
  project_name: string | null;
  currency: string;
  issue_date: string;
  valid_until: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  sent_at: string | null;
  accepted_at: string | null;
  converted_invoice_id: string | null;
  converted_invoice_number: string | null;
}

export async function getEstimate(supabase: ServerSupabaseClient, organizationId: string, id: string): Promise<EstimateDetail | null> {
  const { data, error } = await supabase
    .from("estimates")
    .select(
      "id, number, title, status, customer_id, project_id, currency, issue_date, valid_until, notes, terms, subtotal, discount_total, tax_total, total, sent_at, accepted_at, converted_invoice_id",
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load estimate: ${error.message}`);
  if (!data) return null;
  const [customers, projects, invoice] = await Promise.all([
    namesById(supabase, "customers", organizationId, [data.customer_id]),
    namesById(supabase, "projects", organizationId, [data.project_id]),
    data.converted_invoice_id
      ? supabase.from("invoices").select("number").eq("organization_id", organizationId).eq("id", data.converted_invoice_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  return {
    ...data,
    subtotal: str(data.subtotal),
    discount_total: str(data.discount_total),
    tax_total: str(data.tax_total),
    total: str(data.total),
    customer_name: customers.get(data.customer_id) ?? null,
    project_name: data.project_id ? (projects.get(data.project_id) ?? null) : null,
    converted_invoice_number: invoice.data?.number ?? null,
  };
}

// --- Lines --------------------------------------------------------------------

export interface DocumentLine {
  id: string;
  position: number;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  tax_rate: string;
  line_subtotal: string;
  line_tax: string;
  line_total: string;
}

export async function listDocumentLines(supabase: ServerSupabaseClient, organizationId: string, kind: DocumentKind, documentId: string): Promise<DocumentLine[]> {
  const select = "id, position, description, unit, quantity, unit_price, discount_percent, tax_rate, line_subtotal, line_tax, line_total";
  const { data, error } =
    kind === "estimate"
      ? await supabase.from("estimate_items").select(select).eq("organization_id", organizationId).eq("estimate_id", documentId).order("position").order("created_at")
      : await supabase.from("invoice_items").select(select).eq("organization_id", organizationId).eq("invoice_id", documentId).order("position").order("created_at");
  if (error) throw new Error(`Failed to list document lines: ${error.message}`);
  return (data ?? []).map((l) => ({
    id: l.id,
    position: l.position,
    description: l.description,
    unit: l.unit,
    quantity: toFixed(l.quantity, 3).replace(/\.?0+$/, ""),
    unit_price: str(l.unit_price),
    discount_percent: toFixed(l.discount_percent, 2).replace(/\.?0+$/, ""),
    tax_rate: toFixed(l.tax_rate, 4).replace(/\.?0+$/, ""),
    line_subtotal: str(l.line_subtotal),
    line_tax: str(l.line_tax),
    line_total: str(l.line_total),
  }));
}

/** Tax rates valid today; the default one prefills new lines. */
export async function listApplicableTaxRates(supabase: ServerSupabaseClient, organizationId: string, on: string): Promise<{ id: string; name: string; rate: string; is_default: boolean }[]> {
  const { data, error } = await supabase.rpc("applicable_tax_rates", { p_organization_id: organizationId, p_on: on });
  if (error) throw new Error(`applicable_tax_rates failed: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, rate: toFixed(r.rate, 4).replace(/\.?0+$/, ""), is_default: r.is_default }));
}

// --- Invoices -----------------------------------------------------------------

export const INVOICE_VIEWS = ["all", "draft", "open", "overdue", "paid", "void"] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

export interface InvoiceListItem {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  customer_name: string | null;
  issue_date: string;
  due_date: string | null;
  total: string;
  balance_due: string;
  currency: string;
  is_overdue: boolean;
}

export async function listInvoices(
  supabase: ServerSupabaseClient,
  organizationId: string,
  options: { view?: InvoiceView; page?: number; customerId?: string; projectId?: string; pageSize?: number } = {},
): Promise<{ rows: InvoiceListItem[]; total: number }> {
  const pageSize = options.pageSize ?? DOCUMENTS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * pageSize;
  // invoice_overview = invoices without soft-deleted rows, plus is_overdue (caller's RLS applies).
  let query = supabase
    .from("invoice_overview")
    .select("id, number, status, customer_id, issue_date, due_date, total, balance_due, currency, is_overdue", { count: "exact" })
    .eq("organization_id", organizationId);
  switch (options.view) {
    case "draft":
    case "paid":
    case "void":
      query = query.eq("status", options.view);
      break;
    case "open":
      query = query.in("status", ["issued", "partially_paid"]);
      break;
    case "overdue":
      query = query.eq("is_overdue", true);
      break;
  }
  if (options.customerId) query = query.eq("customer_id", options.customerId);
  if (options.projectId) query = query.eq("project_id", options.projectId);
  const { data, error, count } = await query
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Failed to list invoices: ${error.message}`);
  const rows = (data ?? []).filter((r) => r.id && r.status && r.customer_id && r.issue_date && r.currency);
  const customers = await namesById(supabase, "customers", organizationId, rows.map((r) => r.customer_id));
  return {
    rows: rows.map((r) => ({
      id: r.id!,
      number: r.number,
      status: r.status!,
      customer_name: customers.get(r.customer_id!) ?? null,
      issue_date: r.issue_date!,
      due_date: r.due_date,
      total: str(r.total),
      balance_due: str(r.balance_due),
      currency: r.currency!,
      is_overdue: r.is_overdue === true,
    })),
    total: count ?? 0,
  };
}

export interface InvoiceSummary {
  drafts: number;
  open: number;
  overdue: number;
  /** Outstanding balance per currency, e.g. { MDL: "1200.00" }. */
  outstanding: Record<string, string>;
  overdueAmount: Record<string, string>;
}

export async function getInvoiceSummary(supabase: ServerSupabaseClient, organizationId: string): Promise<InvoiceSummary> {
  const [drafts, open] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "draft").is("deleted_at", null),
    supabase
      .from("invoice_overview")
      .select("balance_due, currency, is_overdue")
      .eq("organization_id", organizationId)
      .in("status", ["issued", "partially_paid"])
      .limit(5000),
  ]);
  if (drafts.error) throw new Error(`Failed to count invoices: ${drafts.error.message}`);
  if (open.error) throw new Error(`Failed to summarize invoices: ${open.error.message}`);
  const outstanding: Record<string, string> = {};
  const overdueAmount: Record<string, string> = {};
  let overdue = 0;
  for (const row of open.data ?? []) {
    if (!row.currency) continue;
    outstanding[row.currency] = toFixed(add(outstanding[row.currency] ?? "0", row.balance_due ?? 0));
    if (row.is_overdue) {
      overdue += 1;
      overdueAmount[row.currency] = toFixed(add(overdueAmount[row.currency] ?? "0", row.balance_due ?? 0));
    }
  }
  return { drafts: drafts.count ?? 0, open: (open.data ?? []).length, overdue, outstanding, overdueAmount };
}

export interface InvoiceDetail {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  customer_id: string;
  customer_name: string | null;
  project_id: string | null;
  project_name: string | null;
  estimate_id: string | null;
  estimate_number: string | null;
  currency: string;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  amount_paid: string;
  balance_due: string;
  is_overdue: boolean;
  issued_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export async function getInvoice(supabase: ServerSupabaseClient, organizationId: string, id: string): Promise<InvoiceDetail | null> {
  const { data, error } = await supabase
    .from("invoice_overview")
    .select(
      "id, number, status, customer_id, project_id, estimate_id, currency, issue_date, due_date, notes, terms, subtotal, discount_total, tax_total, total, amount_paid, balance_due, is_overdue, issued_at, paid_at, voided_at, void_reason",
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load invoice: ${error.message}`);
  if (!data || !data.id || !data.status || !data.customer_id || !data.currency || !data.issue_date) return null;
  const [customers, projects, estimate] = await Promise.all([
    namesById(supabase, "customers", organizationId, [data.customer_id]),
    namesById(supabase, "projects", organizationId, [data.project_id]),
    data.estimate_id
      ? supabase.from("estimates").select("number").eq("organization_id", organizationId).eq("id", data.estimate_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  return {
    id: data.id,
    number: data.number,
    status: data.status,
    customer_id: data.customer_id,
    customer_name: customers.get(data.customer_id) ?? null,
    project_id: data.project_id,
    project_name: data.project_id ? (projects.get(data.project_id) ?? null) : null,
    estimate_id: data.estimate_id,
    estimate_number: estimate.data?.number ?? null,
    currency: data.currency,
    issue_date: data.issue_date,
    due_date: data.due_date,
    notes: data.notes,
    terms: data.terms,
    subtotal: str(data.subtotal),
    discount_total: str(data.discount_total),
    tax_total: str(data.tax_total),
    total: str(data.total),
    amount_paid: str(data.amount_paid),
    balance_due: str(data.balance_due),
    is_overdue: data.is_overdue === true,
    issued_at: data.issued_at,
    paid_at: data.paid_at,
    voided_at: data.voided_at,
    void_reason: data.void_reason,
  };
}

export interface InvoicePayment {
  allocation_id: string;
  payment_id: string;
  number: string;
  amount: string;
  method: string;
  paid_on: string;
  reference: string | null;
  voided_at: string | null;
}

export async function listInvoicePayments(supabase: ServerSupabaseClient, organizationId: string, invoiceId: string): Promise<InvoicePayment[]> {
  const { data, error } = await supabase
    .from("payment_allocations")
    .select("id, amount, payment_id, payments(number, method, paid_on, reference, voided_at)")
    .eq("organization_id", organizationId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list payments: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    const p = row.payments as unknown as { number: string; method: string; paid_on: string; reference: string | null; voided_at: string | null } | null;
    if (!p) return [];
    return [
      {
        allocation_id: row.id,
        payment_id: row.payment_id,
        number: p.number,
        amount: str(row.amount),
        method: p.method,
        paid_on: p.paid_on,
        reference: p.reference,
        voided_at: p.voided_at,
      },
    ];
  });
}

/** Projects for document pickers (archived ones excluded). */
export async function listProjectPickerOptions(supabase: ServerSupabaseClient, organizationId: string): Promise<{ id: string; name: string; customer_id: string | null }[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, customer_id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name")
    .limit(500);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return data ?? [];
}

// --- Print parties ------------------------------------------------------------

/** A supplier or customer block on a printed document. */
export interface PrintParty {
  name: string;
  taxId: string | null;
  registrationNumber: string | null;
  lines: string[];
}

type JsonRecord = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const joinParts = (...parts: unknown[]) => parts.map(text).filter(Boolean).join(", ") || null;

function addressLines(a: JsonRecord | null | undefined): string[] {
  if (!a) return [];
  return [text(a.line1) ?? text(a.address_line1), text(a.line2) ?? text(a.address_line2), joinParts(a.postal_code, a.city, a.region), text(a.country_code)].filter(
    (v): v is string => Boolean(v),
  );
}

export function partyFromOrganization(o: JsonRecord): PrintParty {
  return {
    name: text(o.legal_name) ?? text(o.name) ?? "",
    taxId: text(o.tax_id),
    registrationNumber: text(o.registration_number),
    lines: [...addressLines(o), joinParts(o.email, o.phone)].filter((v): v is string => Boolean(v)),
  };
}

/** Customer block from the frozen snapshot of an issued invoice (see issue_invoice). */
export function partyFromCustomerSnapshot(s: JsonRecord): PrintParty {
  return {
    name: text(s.legal_name) ?? text(s.name) ?? "",
    taxId: text(s.tax_id),
    registrationNumber: null,
    lines: [...addressLines(s.address as JsonRecord | null), joinParts(s.email, s.phone)].filter((v): v is string => Boolean(v)),
  };
}

/** Current customer details (drafts and estimates have no snapshot). */
export async function getCustomerParty(supabase: ServerSupabaseClient, organizationId: string, customerId: string): Promise<PrintParty | null> {
  const [customer, address] = await Promise.all([
    supabase.from("customers").select("name, legal_name, tax_id, email, phone").eq("organization_id", organizationId).eq("id", customerId).maybeSingle(),
    supabase
      .from("customer_addresses")
      .select("line1, line2, city, region, postal_code, country_code")
      .eq("organization_id", organizationId)
      .eq("customer_id", customerId)
      .eq("type", "billing")
      .order("is_default", { ascending: false })
      .limit(1),
  ]);
  if (customer.error) throw new Error(`Failed to load customer: ${customer.error.message}`);
  if (address.error) throw new Error(`Failed to load customer address: ${address.error.message}`);
  if (!customer.data) return null;
  return partyFromCustomerSnapshot({ ...customer.data, address: address.data?.[0] ?? null });
}

export async function getInvoiceSnapshots(
  supabase: ServerSupabaseClient,
  organizationId: string,
  invoiceId: string,
): Promise<{ customer: JsonRecord | null; organization: JsonRecord | null }> {
  const { data, error } = await supabase
    .from("invoices")
    .select("customer_snapshot, organization_snapshot")
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load invoice snapshots: ${error.message}`);
  const asRecord = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : null);
  return { customer: asRecord(data?.customer_snapshot), organization: asRecord(data?.organization_snapshot) };
}

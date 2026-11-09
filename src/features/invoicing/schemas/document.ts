import { z } from "zod";
import { currencyField, dateField, moneyField, optionalDate, optionalText, requiredText } from "@/lib/validation/common";
import { compare } from "@/lib/calculations/decimal";

/**
 * Schemas for estimates (devize), invoices (facturi) and payments.
 * The database stays authoritative: numbers, statuses, totals and payment
 * state are written only by triggers and workflow functions
 * (supabase/migrations/*_finance.sql). These schemas give early, localized
 * feedback and keep obviously invalid input away from the database.
 */

export const ESTIMATE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "converted"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ["bank_transfer", "cash", "card", "online", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

type Variant = "neutral" | "primary" | "success" | "warning" | "danger";

export const ESTIMATE_STATUS_VARIANT: Record<EstimateStatus, Variant> = {
  draft: "neutral",
  sent: "primary",
  accepted: "success",
  rejected: "danger",
  expired: "warning",
  converted: "success",
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, Variant> = {
  draft: "neutral",
  issued: "primary",
  partially_paid: "warning",
  paid: "success",
  void: "danger",
};

export const isEstimateStatus = (v: unknown): v is EstimateStatus => typeof v === "string" && (ESTIMATE_STATUSES as readonly string[]).includes(v);
export const isInvoiceStatus = (v: unknown): v is InvoiceStatus => typeof v === "string" && (INVOICE_STATUSES as readonly string[]).includes(v);

/**
 * Status changes a user may make by hand. Mirrors private.guard_estimate_update:
 * accepted and converted estimates are locked, "converted" only happens
 * through convert_estimate_to_invoice().
 */
export const ESTIMATE_TRANSITIONS: Record<EstimateStatus, readonly EstimateStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "draft"],
  rejected: ["draft"],
  expired: ["draft"],
  accepted: [],
  converted: [],
};

/** Lines can change while the estimate is not accepted/converted (guard_document_items). */
export const estimateLinesEditable = (status: EstimateStatus) => status === "draft" || status === "sent" || status === "rejected" || status === "expired";
export const estimateConvertible = (status: EstimateStatus) => status === "sent" || status === "accepted";
/** Invoice lines and header change only while the invoice is a draft (guard_invoice_update). */
export const invoiceEditable = (status: InvoiceStatus) => status === "draft";
export const invoiceOpenForPayment = (status: InvoiceStatus) => status === "issued" || status === "partially_paid";

const normalize = (v: string) => v.trim().replace(",", ".");

/** Exact decimal string: up to `intDigits` integer digits and `fraction` decimals. */
const decimalString = (intDigits: number, fraction: number, error: string) => {
  const pattern = new RegExp(`^\\d{1,${intDigits}}(\\.\\d{1,${fraction}})?$`);
  return z
    .string({ error: "required" })
    .transform(normalize)
    .refine((v) => v !== "", { error: "required" })
    .refine((v) => v === "" || pattern.test(v), { error });
};

export const percentField = (fraction: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || normalize(v) === "" ? "0" : normalize(v)))
    .refine((v) => new RegExp(`^\\d{1,3}(\\.\\d{1,${fraction}})?$`).test(v) && Number(v) <= 100, { error: "percent" });

export const lineSchema = z.object({
  description: requiredText(1, 1000),
  unit: requiredText(1, 16),
  quantity: decimalString(10, 3, "quantity").refine((v) => Number(v) > 0, { error: "quantity" }),
  unitPrice: decimalString(11, 2, "number"),
  discountPercent: percentField(2),
  taxRate: percentField(4),
});
export type LineInput = z.input<typeof lineSchema>;
export type LineValues = z.output<typeof lineSchema>;

const optionalReference = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" ? v : undefined))
  .pipe(z.uuid({ error: "invalidOption" }).optional());

const requiredDate = dateField.refine((v) => v !== "", { error: "required" });

const documentBase = {
  customerId: z.uuid({ error: "required" }),
  projectId: optionalReference,
  currency: currencyField,
  issueDate: requiredDate,
  notes: optionalText(10000),
  terms: optionalText(10000),
};

export const estimateHeaderSchema = z
  .object({
    ...documentBase,
    title: optionalText(200),
    validUntil: optionalDate,
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.issueDate, { path: ["validUntil"], error: "dateOrder" });
export type EstimateHeaderInput = z.input<typeof estimateHeaderSchema>;

export const invoiceHeaderSchema = z
  .object({
    ...documentBase,
    dueDate: optionalDate,
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.issueDate, { path: ["dueDate"], error: "dateOrder" });
export type InvoiceHeaderInput = z.input<typeof invoiceHeaderSchema>;

export const estimateStatusSchema = z.enum(ESTIMATE_STATUSES, { error: "invalidOption" });

export const voidSchema = z.object({ reason: requiredText(3, 500) });
export type VoidInput = z.input<typeof voidSchema>;

/** Payment against one invoice. The idempotency key is created when the dialog opens. */
export const paymentSchema = z.object({
  amount: moneyField.refine((v) => v !== "" && compare(v, "0") > 0, { error: "number" }),
  method: z.enum(PAYMENT_METHODS, { error: "invalidOption" }),
  paidOn: requiredDate,
  reference: optionalText(120),
  idempotencyKey: z.string().min(8).max(120),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const DOCUMENT_KINDS = ["estimate", "invoice"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

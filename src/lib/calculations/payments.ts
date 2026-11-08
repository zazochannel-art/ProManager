import { dec, gt, isZero, lte, sub, sum, toFixed, type DecimalInput } from "./decimal";

export type InvoicePaymentStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export interface InvoiceBalance {
  amountPaid: string;
  balanceDue: string;
  status: InvoicePaymentStatus;
}

/** Mirrors private.refresh_invoice_payment_state() in the database. */
export function calculateInvoiceBalance(
  total: DecimalInput,
  allocations: readonly DecimalInput[],
  currentStatus: InvoicePaymentStatus = "issued",
): InvoiceBalance {
  const paid = sum(allocations);
  const balance = sub(total, paid);
  let status: InvoicePaymentStatus;
  if (currentStatus === "void" || currentStatus === "draft") status = currentStatus;
  else if (!isZero(total) && lte(total, paid)) status = "paid";
  else if (gt(paid, 0)) status = "partially_paid";
  else status = "issued";
  return { amountPaid: toFixed(paid), balanceDue: toFixed(balance), status };
}

export function isInvoiceOverdue(
  invoice: { status: InvoicePaymentStatus; dueDate: string | null },
  today: string,
): boolean {
  if (invoice.status !== "issued" && invoice.status !== "partially_paid") return false;
  if (!invoice.dueDate) return false;
  return invoice.dueDate < today; // ISO yyyy-mm-dd strings compare lexicographically
}

export interface AllocationCandidate {
  invoiceId: string;
  amount: DecimalInput;
  balanceDue: DecimalInput;
  currency: string;
  status: InvoicePaymentStatus;
  allowOverpayment?: boolean;
}

export type AllocationError =
  | { code: "amount_not_positive"; invoiceId?: string }
  | { code: "currency_mismatch"; invoiceId: string }
  | { code: "invoice_not_open"; invoiceId: string }
  | { code: "exceeds_balance"; invoiceId: string }
  | { code: "exceeds_payment" }
  | { code: "duplicate_invoice"; invoiceId: string };

/**
 * Pre-validates a payment before calling public.record_payment(). The
 * database repeats every check under row locks; this gives users immediate,
 * specific feedback.
 */
export function validatePaymentAllocations(
  payment: { amount: DecimalInput; currency: string },
  allocations: readonly AllocationCandidate[],
): AllocationError[] {
  const errors: AllocationError[] = [];
  if (!gt(payment.amount, 0)) errors.push({ code: "amount_not_positive" });
  const seen = new Set<string>();
  for (const a of allocations) {
    if (seen.has(a.invoiceId)) errors.push({ code: "duplicate_invoice", invoiceId: a.invoiceId });
    seen.add(a.invoiceId);
    if (!gt(a.amount, 0)) errors.push({ code: "amount_not_positive", invoiceId: a.invoiceId });
    if (a.currency !== payment.currency) errors.push({ code: "currency_mismatch", invoiceId: a.invoiceId });
    if (a.status !== "issued" && a.status !== "partially_paid") errors.push({ code: "invoice_not_open", invoiceId: a.invoiceId });
    if (!a.allowOverpayment && gt(a.amount, a.balanceDue)) errors.push({ code: "exceeds_balance", invoiceId: a.invoiceId });
  }
  if (gt(sum(allocations.map((a) => dec(a.amount))), payment.amount)) errors.push({ code: "exceeds_payment" });
  return errors;
}

import { z } from "zod";
import { compare, isDecimalString } from "@/lib/calculations/decimal";
import { currencyField, dateField, moneyField, optionalDate, optionalText, requiredText } from "@/lib/validation/common";
import { percentField } from "@/features/invoicing/schemas/document";

// --- VAT rates ------------------------------------------------------------------

const requiredDate = dateField.refine((v) => v !== "", { error: "required" });

export const taxRateSchema = z
  .object({
    name: requiredText(1, 80),
    rate: percentField(4),
    validFrom: requiredDate,
    validTo: optionalDate,
    isDefault: z.boolean().default(false),
  })
  .refine((v) => !v.validTo || v.validTo >= v.validFrom, { path: ["validTo"], error: "dateOrder" });
export type TaxRateInput = z.input<typeof taxRateSchema>;

// --- Expenses -------------------------------------------------------------------

/** Mirrors public.expense_kind. */
export const EXPENSE_KINDS = ["material", "labor", "subcontractor", "equipment", "transport", "overhead", "other"] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];
export const isExpenseKind = (v: unknown): v is ExpenseKind => (EXPENSE_KINDS as readonly unknown[]).includes(v);

export const EXPENSE_PAYMENT_STATUSES = ["unpaid", "paid"] as const;
export type ExpensePaymentStatus = (typeof EXPENSE_PAYMENT_STATUSES)[number];

/** "none" (the picker's empty choice) and "" become undefined; anything else must be a uuid. */
const optionalReference = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" ? v : undefined))
  .pipe(z.uuid({ error: "invalidOption" }).optional());

export const expenseSchema = z
  .object({
    description: requiredText(1, 500),
    kind: z.enum(EXPENSE_KINDS, { error: "invalidOption" }),
    categoryId: optionalReference,
    projectId: optionalReference,
    supplierId: optionalReference,
    amount: moneyField.refine((v) => v !== "", { error: "required" }),
    taxAmount: moneyField.optional().transform((v) => (v ? v : "0")),
    currency: currencyField,
    expenseDate: requiredDate,
    paymentStatus: z.enum(EXPENSE_PAYMENT_STATUSES, { error: "invalidOption" }),
    paidOn: optionalDate,
    reference: optionalText(120),
  })
  // Runs only once both amounts parsed (an empty amount already reports "required").
  .refine((v) => !isDecimalString(v.amount) || !isDecimalString(v.taxAmount) || compare(v.amount, "0") > 0 || compare(v.taxAmount, "0") > 0, {
    path: ["amount"],
    error: "number",
  })
  .refine((v) => !v.paidOn || v.paidOn >= v.expenseDate, { path: ["paidOn"], error: "dateOrder" })
  // A paid date only makes sense for a paid expense; it is cleared otherwise.
  .transform((v) => ({ ...v, paidOn: v.paymentStatus === "paid" ? v.paidOn : undefined }));
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseValues = z.output<typeof expenseSchema>;

export const expenseCategorySchema = z.object({
  name: requiredText(1, 80),
  kind: z.enum(EXPENSE_KINDS, { error: "invalidOption" }),
});
export type ExpenseCategoryInput = z.input<typeof expenseCategorySchema>;

export const markPaidSchema = z.object({ paidOn: requiredDate });

import { describe, expect, it } from "vitest";
import { calculateDocumentTotals, calculateLine } from "@/lib/calculations/documents";
import { calculateInvoiceBalance, isInvoiceOverdue, validatePaymentAllocations } from "@/lib/calculations/payments";
import { computePeriodProfit, computeProjectProfitability } from "@/lib/calculations/profitability";

describe("document line math", () => {
  it("computes subtotal, discount, tax and total per line", () => {
    expect(calculateLine({ quantity: "12", unitPrice: "310.50", discountPercent: "5", taxRate: "20" })).toEqual({
      lineSubtotal: "3726.00",
      lineDiscount: "186.30",
      lineTax: "707.94",
      lineTotal: "4247.64",
    });
  });

  it("rounds each line before summing (same as the database)", () => {
    const totals = calculateDocumentTotals([
      { quantity: "3", unitPrice: "0.333", taxRate: "20" },
      { quantity: "1", unitPrice: "0.005" },
    ]);
    expect(totals.lines[0]?.lineSubtotal).toBe("1.00");
    expect(totals.lines[1]?.lineSubtotal).toBe("0.01");
    expect(totals.subtotal).toBe("1.01");
    expect(totals.taxTotal).toBe("0.20");
    expect(totals.total).toBe("1.21");
  });

  it("matches the seeded demo invoice", () => {
    const totals = calculateDocumentTotals([
      { quantity: "40", unitPrice: "250", taxRate: "20" },
      { quantity: "12", unitPrice: "310.50", discountPercent: "5", taxRate: "20" },
    ]);
    expect(totals).toMatchObject({ subtotal: "13726.00", discountTotal: "186.30", taxTotal: "2707.94", total: "16247.64" });
  });

  it("rejects invalid input instead of producing wrong totals", () => {
    expect(() => calculateLine({ quantity: "0", unitPrice: "10" })).toThrow(RangeError);
    expect(() => calculateLine({ quantity: "1", unitPrice: "-1" })).toThrow(RangeError);
    expect(() => calculateLine({ quantity: "1", unitPrice: "1", discountPercent: "101" })).toThrow(RangeError);
    expect(() => calculateLine({ quantity: "1", unitPrice: "1", taxRate: "-5" })).toThrow(RangeError);
  });

  it("does not hard-code any VAT rate", () => {
    expect(calculateLine({ quantity: "1", unitPrice: "100" }).lineTax).toBe("0.00");
    expect(calculateLine({ quantity: "1", unitPrice: "100", taxRate: "19" }).lineTax).toBe("19.00");
    expect(calculateLine({ quantity: "1", unitPrice: "100", taxRate: "8" }).lineTax).toBe("8.00");
  });
});

describe("invoice payments", () => {
  it("derives balance and status from allocations", () => {
    expect(calculateInvoiceBalance("100.00", [])).toEqual({ amountPaid: "0.00", balanceDue: "100.00", status: "issued" });
    expect(calculateInvoiceBalance("100.00", ["30", "20.5"])).toEqual({ amountPaid: "50.50", balanceDue: "49.50", status: "partially_paid" });
    expect(calculateInvoiceBalance("100.00", ["100"])).toMatchObject({ balanceDue: "0.00", status: "paid" });
    expect(calculateInvoiceBalance("100.00", ["10"], "void").status).toBe("void");
  });

  it("detects overdue invoices by due date", () => {
    expect(isInvoiceOverdue({ status: "issued", dueDate: "2026-01-10" }, "2026-01-11")).toBe(true);
    expect(isInvoiceOverdue({ status: "issued", dueDate: "2026-01-11" }, "2026-01-11")).toBe(false);
    expect(isInvoiceOverdue({ status: "paid", dueDate: "2026-01-01" }, "2026-02-01")).toBe(false);
    expect(isInvoiceOverdue({ status: "partially_paid", dueDate: null }, "2026-02-01")).toBe(false);
  });

  it("validates allocations: overpayment, currency, duplicates, closed invoices", () => {
    const base = { invoiceId: "a", amount: "50", balanceDue: "40", currency: "MDL", status: "issued" as const };
    expect(validatePaymentAllocations({ amount: "50", currency: "MDL" }, [base])).toEqual([{ code: "exceeds_balance", invoiceId: "a" }]);
    expect(validatePaymentAllocations({ amount: "50", currency: "MDL" }, [{ ...base, allowOverpayment: true }])).toEqual([]);
    expect(validatePaymentAllocations({ amount: "40", currency: "EUR" }, [{ ...base, amount: "40" }])).toEqual([
      { code: "currency_mismatch", invoiceId: "a" },
    ]);
    expect(validatePaymentAllocations({ amount: "10", currency: "MDL" }, [{ ...base, amount: "20", balanceDue: "100" }])).toEqual([
      { code: "exceeds_payment" },
    ]);
    const dupes = validatePaymentAllocations({ amount: "100", currency: "MDL" }, [
      { ...base, amount: "10" },
      { ...base, amount: "10" },
    ]);
    expect(dupes).toContainEqual({ code: "duplicate_invoice", invoiceId: "a" });
    expect(validatePaymentAllocations({ amount: "10", currency: "MDL" }, [{ ...base, amount: "10", status: "paid" }])).toContainEqual({
      code: "invoice_not_open",
      invoiceId: "a",
    });
    expect(validatePaymentAllocations({ amount: "0", currency: "MDL" }, [])).toEqual([{ code: "amount_not_positive" }]);
  });
});

describe("profitability", () => {
  it("computes project profit, margin, receivable and budget usage", () => {
    const result = computeProjectProfitability({
      currency: "MDL",
      budget: "10000",
      revenue: "8000",
      cash_collected: "5000",
      material_costs: "2000",
      labor_expenses: "1000",
      labor_time_cost: "500",
      other_costs: "250.50",
      excluded_foreign_currency_items: 0,
    });
    expect(result).toMatchObject({
      directCosts: "3750.50",
      grossProfit: "4249.50",
      marginPercent: "53.12",
      receivable: "3000.00",
      cashFlow: "1249.50",
      budgetUsedPercent: "37.51",
    });
  });

  it("returns null margin when there is no revenue", () => {
    expect(computePeriodProfit("0", "100")).toEqual({ profit: "-100.00", marginPercent: null });
    expect(computePeriodProfit("200", "50")).toEqual({ profit: "150.00", marginPercent: "75.00" });
  });
});

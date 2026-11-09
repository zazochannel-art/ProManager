import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import {
  ESTIMATE_STATUSES,
  ESTIMATE_TRANSITIONS,
  estimateConvertible,
  estimateHeaderSchema,
  estimateLinesEditable,
  invoiceHeaderSchema,
  lineSchema,
  paymentSchema,
} from "@/features/invoicing/schemas/document";

const saveLineAction = vi.fn(async () => ({ ok: true as const, data: { id: "line-new" } }));
vi.mock("@/features/invoicing/actions/line-actions", () => ({
  saveLineAction: (...args: unknown[]) => saveLineAction(...(args as [])),
  deleteLineAction: vi.fn(),
}));
vi.mock("@/features/invoicing/actions/invoice-actions", () => ({
  recordInvoicePaymentAction: vi.fn(),
  voidPaymentAction: vi.fn(),
  issueInvoiceAction: vi.fn(),
  voidInvoiceAction: vi.fn(),
  deleteInvoiceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { DocumentLines } = await import("@/features/invoicing/components/document-lines");
const { InvoicePayments } = await import("@/features/invoicing/components/invoice-payments");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

const DOC = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";

describe("line schema", () => {
  it("accepts comma decimals and fills empty percentages with zero", () => {
    const parsed = lineSchema.parse({ description: "Faianță", unit: "m²", quantity: "12,5", unitPrice: "89,90", discountPercent: "", taxRate: "" });
    expect(parsed).toMatchObject({ quantity: "12.5", unitPrice: "89.90", discountPercent: "0", taxRate: "0" });
  });

  it("rejects zero quantities, too many decimals and percentages above 100", () => {
    const base = { description: "x", unit: "buc", quantity: "1", unitPrice: "1", discountPercent: "0", taxRate: "20" };
    const issue = (patch: Partial<typeof base>) => lineSchema.safeParse({ ...base, ...patch }).error?.issues[0]?.message;
    expect(issue({ quantity: "0" })).toBe("quantity");
    expect(issue({ quantity: "1.2345" })).toBe("quantity");
    expect(issue({ unitPrice: "1.234" })).toBe("number");
    expect(issue({ discountPercent: "101" })).toBe("percent");
    expect(issue({ taxRate: "-5" })).toBe("percent");
    expect(issue({ description: " " })).toBe("required");
  });
});

describe("document headers", () => {
  const base = { customerId: CUSTOMER, projectId: "none", currency: "MDL", issueDate: "2026-11-01" };

  it("requires a customer and keeps dates in order", () => {
    expect(estimateHeaderSchema.safeParse({ ...base, customerId: "" }).success).toBe(false);
    expect(estimateHeaderSchema.safeParse({ ...base, validUntil: "2026-10-01" }).error?.issues[0]?.message).toBe("dateOrder");
    expect(invoiceHeaderSchema.safeParse({ ...base, dueDate: "2026-10-31" }).error?.issues[0]?.message).toBe("dateOrder");
    expect(invoiceHeaderSchema.parse({ ...base, dueDate: "" })).toMatchObject({ projectId: undefined, dueDate: undefined });
  });

  it("refuses zero or negative payments", () => {
    const p = { method: "cash", paidOn: "2026-11-02", idempotencyKey: "abcdefgh-1" };
    expect(paymentSchema.safeParse({ ...p, amount: "0" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...p, amount: "-1" }).success).toBe(false);
    expect(paymentSchema.parse({ ...p, amount: "10,5" }).amount).toBe("10.5");
  });
});

describe("estimate status rules", () => {
  it("never offers 'converted' by hand and locks accepted estimates", () => {
    for (const status of ESTIMATE_STATUSES) expect(ESTIMATE_TRANSITIONS[status]).not.toContain("converted");
    expect(ESTIMATE_TRANSITIONS.accepted).toEqual([]);
    expect(estimateLinesEditable("accepted")).toBe(false);
    expect(estimateLinesEditable("sent")).toBe(true);
    expect(estimateConvertible("draft")).toBe(false);
    expect(estimateConvertible("accepted")).toBe(true);
  });
});

describe("DocumentLines", () => {
  const lines = [
    { id: "l1", description: "Montaj gresie", unit: "m²", quantity: "12.5", unit_price: "100.00", discount_percent: "0", tax_rate: "20", line_total: "1500.00" },
  ];
  const totals = { subtotal: "1250.00", discount_total: "0.00", tax_total: "250.00", total: "1500.00" };

  it("shows lines and totals, and previews a new line with the database formula", async () => {
    const user = userEvent.setup();
    render(
      withI18n(
        <DocumentLines kind="invoice" documentId={DOC} currency="MDL" lines={lines} totals={totals} editable defaultTaxRate="20" taxRates={[{ id: "t", name: "Standard", rate: "20" }]} />,
      ),
    );
    expect(screen.getByText("Montaj gresie")).toBeInTheDocument();
    expect(screen.getAllByText(/1,500\.00/).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("Description"), "Adeziv");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "3");
    await user.type(screen.getByLabelText("Unit price"), "10,5");
    // 3 × 10.50 = 31.50 + 20 % VAT = 37.80
    expect(screen.getByText(/Line total: MDL\s*37\.80/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add line" }));
    expect(saveLineAction).toHaveBeenCalledWith("invoice", DOC, null, expect.objectContaining({ description: "Adeziv", quantity: "3", unitPrice: "10.5", taxRate: "20" }));
  });

  it("hides the editor when the document is locked", () => {
    render(withI18n(<DocumentLines kind="invoice" documentId={DOC} currency="MDL" lines={lines} totals={totals} editable={false} lockedMessage="Locked" defaultTaxRate="0" taxRates={[]} />));
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add line" })).not.toBeInTheDocument();
  });
});

describe("InvoicePayments", () => {
  it("offers recording a payment only while the invoice is open", () => {
    const payment = { allocation_id: "a", payment_id: "33333333-3333-4333-8333-333333333333", number: "PAY-2026-0001", amount: "100.00", method: "cash", paid_on: "2026-11-02", reference: null, voided_at: null };
    const { rerender } = render(
      withI18n(<InvoicePayments invoiceId={DOC} invoiceNumber="INV-1" currency="MDL" balanceDue="50.00" payments={[payment]} openForPayment issued canWrite today="2026-11-08" />),
    );
    expect(screen.getByText("PAY-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
    rerender(withI18n(<InvoicePayments invoiceId={DOC} invoiceNumber="INV-1" currency="MDL" balanceDue="0.00" payments={[payment]} openForPayment={false} issued canWrite today="2026-11-08" />));
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });
});

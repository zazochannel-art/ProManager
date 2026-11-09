import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { formatAmountsByCurrency } from "@/lib/currency/amounts";
import { expenseCategorySchema, expenseSchema, taxRateSchema } from "@/features/finance/schemas/finance";

const createExpenseAction = vi.fn(async (_values: unknown) => ({ ok: true as const, data: { id: "e1" } }));
vi.mock("@/features/finance/actions/expense-actions", () => ({
  createExpenseAction: (values: unknown) => createExpenseAction(values),
  updateExpenseAction: vi.fn(),
  markExpensePaidAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  createExpenseCategoryAction: vi.fn(),
  updateExpenseCategoryAction: vi.fn(),
  setExpenseCategoryActiveAction: vi.fn(),
  deleteExpenseCategoryAction: vi.fn(),
}));
vi.mock("@/features/finance/actions/tax-rate-actions", () => ({
  createTaxRateAction: vi.fn(),
  updateTaxRateAction: vi.fn(),
  setDefaultTaxRateAction: vi.fn(),
  setTaxRateActiveAction: vi.fn(),
  deleteTaxRateAction: vi.fn(),
}));
vi.mock("@/features/finance/actions/payment-actions", () => ({ voidPaymentFromListAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { TaxRatesPanel } = await import("@/features/finance/components/tax-rates-panel");
const { ExpenseDialog } = await import("@/features/finance/components/expense-dialog");
const { PaymentsTable } = await import("@/features/finance/components/payments-table");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

describe("VAT rate schema", () => {
  it("accepts comma decimals and keeps validity dates in order", () => {
    expect(taxRateSchema.parse({ name: "Redus", rate: "8,5", validFrom: "2026-01-01" })).toMatchObject({ rate: "8.5", isDefault: false });
    expect(taxRateSchema.safeParse({ name: "x", rate: "101", validFrom: "2026-01-01" }).error?.issues[0]?.message).toBe("percent");
    expect(taxRateSchema.safeParse({ name: "x", rate: "20", validFrom: "2026-01-01", validTo: "2025-12-31" }).error?.issues[0]?.message).toBe("dateOrder");
    expect(taxRateSchema.safeParse({ name: "x", rate: "20", validFrom: "" }).error?.issues[0]?.message).toBe("required");
  });
});

describe("expense schema", () => {
  const base = { description: "Adeziv", kind: "material", amount: "100", currency: "MDL", expenseDate: "2026-11-05", paymentStatus: "unpaid" } as const;

  it("normalizes amounts, drops empty pickers and clears the paid date of unpaid expenses", () => {
    const parsed = expenseSchema.parse({ ...base, amount: "100,50", taxAmount: "", categoryId: "none", projectId: "", paidOn: "2026-11-06" });
    expect(parsed).toMatchObject({ amount: "100.50", taxAmount: "0", categoryId: undefined, projectId: undefined, paidOn: undefined });
    expect(expenseSchema.parse({ ...base, paymentStatus: "paid", paidOn: "2026-11-06" }).paidOn).toBe("2026-11-06");
  });

  it("refuses an empty total, a paid date before the expense and unknown kinds", () => {
    const issue = (patch: Record<string, unknown>) => expenseSchema.safeParse({ ...base, ...patch }).error?.issues[0]?.message;
    expect(issue({ amount: "0", taxAmount: "0" })).toBe("number");
    expect(issue({ amount: "" })).toBe("required");
    expect(issue({ amount: "1.234" })).toBe("number");
    expect(issue({ paymentStatus: "paid", paidOn: "2026-11-01" })).toBe("dateOrder");
    expect(issue({ kind: "food" })).toBe("invalidOption");
    expect(issue({ projectId: "not-a-uuid" })).toBe("invalidOption");
    expect(expenseCategorySchema.safeParse({ name: " ", kind: "labor" }).success).toBe(false);
  });
});

describe("formatAmountsByCurrency", () => {
  it("puts the organization currency first and skips zero totals", () => {
    const text = formatAmountsByCurrency({ EUR: "300.00", MDL: "1200.00", RON: "0.00" }, "MDL", "en");
    expect(text).toMatch(/^MDL\s?1,200\.00 · EUR\s?300\.00$/);
    expect(formatAmountsByCurrency({ MDL: "0.00" }, "MDL", "en")).toBeNull();
  });
});

describe("TaxRatesPanel", () => {
  const rates = [
    { id: "r1", name: "Standard VAT", rate: "20", valid_from: "2020-01-01", valid_to: null, is_default: true, is_active: true },
    { id: "r2", name: "Old reduced", rate: "8", valid_from: "2019-01-01", valid_to: "2024-12-31", is_default: false, is_active: false },
  ];

  it("shows default and inactive rates, and hides management for read-only members", () => {
    const { rerender } = render(withI18n(<TaxRatesPanel rates={rates} canManage={false} today="2026-11-09" />));
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for Standard VAT" })).not.toBeInTheDocument();
    rerender(withI18n(<TaxRatesPanel rates={rates} canManage today="2026-11-09" />));
    expect(screen.getByRole("button", { name: "Add rate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Standard VAT" })).toBeInTheDocument();
  });
});

describe("ExpenseDialog", () => {
  it("previews the total with VAT and sends exact decimals", async () => {
    const user = userEvent.setup();
    render(
      withI18n(
        <ExpenseDialog
          options={{ categories: [], projects: [], suppliers: [] }}
          initialValues={{ description: "", kind: "material", categoryId: "none", projectId: "none", supplierId: "none", amount: "", taxAmount: "", currency: "MDL", expenseDate: "2026-11-05", paymentStatus: "paid", paidOn: "", reference: "" }}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    await user.type(screen.getByLabelText("Description"), "Tile adhesive");
    await user.type(screen.getByLabelText("Amount before VAT"), "100,10");
    await user.type(screen.getByLabelText(/^VAT/), "20,02");
    expect(screen.getByText(/MDL\s?120\.12/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createExpenseAction).toHaveBeenCalledWith(expect.objectContaining({ description: "Tile adhesive", amount: "100.10", taxAmount: "20.02", paymentStatus: "paid", paidOn: undefined }));
  });
});

describe("PaymentsTable", () => {
  const row = {
    id: "33333333-3333-4333-8333-333333333333",
    number: "PAY-2026-0001",
    customer_name: "Client SRL",
    amount: "250.00",
    currency: "MDL",
    method: "bank_transfer",
    paid_on: "2026-11-02",
    reference: "OP 12",
    voided_at: null,
    void_reason: null,
    invoices: [{ id: "44444444-4444-4444-8444-444444444444", number: "INV-2026-0001" }],
  };

  it("links the invoices and offers voiding only for valid payments", () => {
    render(withI18n(<PaymentsTable rows={[row, { ...row, id: "p2", number: "PAY-2026-0002", voided_at: "2026-11-03T10:00:00Z", void_reason: "retur" }]} canWrite />));
    expect(screen.getAllByRole("link", { name: "INV-2026-0001" })[0]).toHaveAttribute("href", "/dashboard/invoices/44444444-4444-4444-8444-444444444444");
    expect(screen.getByRole("button", { name: "Void payment: PAY-2026-0001" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Void payment: PAY-2026-0002" })).not.toBeInTheDocument();
    expect(screen.getByText("voided")).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { isLowStock, itemSchema, movementSchema, signedQuantity } from "@/features/inventory/schemas/inventory";
import { supplierSchema } from "@/features/suppliers/schemas/supplier";

const recordMovementAction = vi.fn(async (_id: string, _values: unknown) => ({ ok: true as const, data: { id: "m1" } }));
vi.mock("@/features/inventory/actions/inventory-actions", () => ({
  recordMovementAction: (id: string, values: unknown) => recordMovementAction(id, values),
  createItemAction: vi.fn(),
  updateItemAction: vi.fn(),
  archiveItemAction: vi.fn(),
  listItemMovementsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { MovementDialog } = await import("@/features/inventory/components/movement-dialog");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

describe("supplier schema", () => {
  it("needs only a name and checks the email", () => {
    expect(supplierSchema.parse({ name: " Supraten SRL ", email: "" })).toMatchObject({ name: "Supraten SRL", email: undefined });
    expect(supplierSchema.safeParse({ name: "" }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "X", email: "not-an-email" }).error?.issues[0]?.message).toBe("email");
  });
});

describe("inventory item schema", () => {
  it("normalizes decimals and leaves empty prices out", () => {
    const parsed = itemSchema.parse({ name: "Adeziv", unit: "sac", currency: "MDL", unitCost: "89,90", salePrice: "", reorderLevel: "12,5", supplierId: "none" });
    expect(parsed).toMatchObject({ unitCost: "89.90", salePrice: undefined, reorderLevel: "12.5", supplierId: undefined });
    expect(itemSchema.safeParse({ name: "x", unit: "buc", currency: "MDL", reorderLevel: "1.2345" }).error?.issues[0]?.message).toBe("quantity");
  });
});

describe("stock movements", () => {
  const base = { quantity: "3", occurredOn: "2026-11-09" };

  it("stores issues and downward adjustments as negative quantities", () => {
    expect(signedQuantity(movementSchema.parse({ ...base, kind: "receipt" }))).toBe("3");
    expect(signedQuantity(movementSchema.parse({ ...base, kind: "issue" }))).toBe("-3");
    expect(signedQuantity(movementSchema.parse({ ...base, kind: "return" }))).toBe("3");
    expect(signedQuantity(movementSchema.parse({ ...base, kind: "adjustment", direction: "out" }))).toBe("-3");
    expect(signedQuantity(movementSchema.parse({ ...base, kind: "adjustment", direction: "in" }))).toBe("3");
  });

  it("keeps a cost only on receipts and a project only on issues and returns", () => {
    const project = "11111111-1111-4111-8111-111111111111";
    expect(movementSchema.parse({ ...base, kind: "issue", unitCost: "5", projectId: project })).toMatchObject({ unitCost: undefined, projectId: project });
    expect(movementSchema.parse({ ...base, kind: "receipt", unitCost: "5,5", projectId: project })).toMatchObject({ unitCost: "5.5", projectId: undefined });
  });

  it("refuses zero, negative and over-precise quantities", () => {
    for (const quantity of ["0", "-1", "1.2345", ""]) expect(movementSchema.safeParse({ ...base, kind: "receipt", quantity }).success).toBe(false);
  });

  it("flags stock at or below the minimum", () => {
    expect(isLowStock("5", "5")).toBe(true);
    expect(isLowStock("5.001", "5")).toBe(false);
    expect(isLowStock("0", null)).toBe(false);
  });
});

describe("MovementDialog", () => {
  it("asks for a project on issues and records the movement", async () => {
    const user = userEvent.setup();
    render(
      withI18n(
        <MovementDialog
          item={{ id: "i1", name: "Tile adhesive", unit: "bag", on_hand: "20", unit_cost: "89.90", currency: "MDL" }}
          kind="issue"
          projects={[{ id: "11111111-1111-4111-8111-111111111111", name: "Botanica flat" }]}
          today="2026-11-09"
          onClose={() => undefined}
        />,
      ),
    );
    expect(screen.getByText("In stock now: 20 bag")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.queryByText(/^Unit cost/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Quantity (bag)"), "4");
    await user.click(screen.getByRole("button", { name: "Record" }));
    expect(recordMovementAction).toHaveBeenCalledWith("i1", expect.objectContaining({ kind: "issue", quantity: "4" }));
  });
});

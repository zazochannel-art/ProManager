import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { employeeSchema } from "@/features/employees/schemas/employee";

vi.mock("@/features/employees/actions/employee-actions", () => ({ createEmployeeAction: vi.fn(), updateEmployeeAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { EmployeesList } = await import("@/features/employees/components/employees-list");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

const ANA = "33333333-3333-4333-8333-333333333333";

describe("employeeSchema", () => {
  it("normalizes optional fields and validates the rate", () => {
    const base = { firstName: "Ion", employmentType: "full_time", costCurrency: "MDL", isActive: true };
    expect(employeeSchema.parse({ ...base, hourlyCost: "120,5", userId: "none", email: "" })).toMatchObject({ hourlyCost: "120.5", userId: undefined, email: undefined });
    expect(employeeSchema.safeParse({ ...base, hourlyCost: "-1" }).success).toBe(false);
    expect(employeeSchema.safeParse({ ...base, firstName: " " }).success).toBe(false);
    expect(employeeSchema.safeParse({ ...base, employmentType: "intern" }).success).toBe(false);
  });
});

describe("EmployeesList", () => {
  it("shows rate, linked account and missing rates; no edit for read-only roles", () => {
    render(
      withI18n(
        <EmployeesList
          canManage={false}
          defaultCurrency="MDL"
          accounts={[{ userId: ANA, name: "Ana Rusu" }]}
          employees={[
            { id: "1", first_name: "Ana", last_name: "Rusu", position: "Electrician", email: null, phone: null, employment_type: "full_time", hourly_cost: "150", cost_currency: "MDL", hire_date: null, user_id: ANA, is_active: true },
            { id: "2", first_name: "Victor", last_name: "", position: null, email: null, phone: null, employment_type: "contractor", hourly_cost: null, cost_currency: null, hire_date: null, user_id: null, is_active: false },
          ]}
        />,
      ),
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first!).getByText("Account: Ana Rusu")).toBeInTheDocument();
    expect(within(first!).getByText(/150/)).toBeInTheDocument();
    expect(within(second!).getByText(en.employees.noRate)).toBeInTheDocument();
    expect(within(second!).getByText(en.employees.inactive)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

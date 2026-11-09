import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { isPortalToken, portalAccessSchema, portalAccessStatus } from "@/features/portal/schemas/portal";
import { hashInvitationToken } from "@/features/organizations/services/invitation-token";

vi.mock("server-only", () => ({}));

/** Records every query the portal service sends, so the test can check its filters. */
type Call = { table: string; filters: [string, ...unknown[]][]; update?: unknown };
const calls: Call[] = [];
const results: Record<string, unknown> = {};
function builder(table: string) {
  const call: Call = { table, filters: [] };
  calls.push(call);
  const self: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "order", "limit"]) {
    self[m] = (...args: unknown[]) => {
      if (m !== "select" && m !== "order" && m !== "limit") call.filters.push([m, ...args]);
      return self;
    };
  }
  self.update = (v: unknown) => {
    call.update = v;
    return self;
  };
  const result = () => results[table] ?? { data: null, error: null };
  self.maybeSingle = async () => result();
  self.then = (resolve: (v: unknown) => void) => resolve(Array.isArray((result() as { data: unknown }).data) ? result() : { data: [], error: null });
  return self;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => builder(table) }) }));

const createPortalAccessAction = vi.fn(async (_v: unknown) => ({ ok: true as const, data: { url: "https://app.test/portal/abc", email: "ana@client.md", emailSent: false, expiresAt: "2027-02-07T00:00:00Z" } }));
vi.mock("@/features/portal/actions/portal-actions", () => ({
  createPortalAccessAction: (v: unknown) => createPortalAccessAction(v),
  revokePortalAccessAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { resolvePortalAccess, getPortalOverview } = await import("@/features/portal/services/portal-service");
const { PortalAccessDialog } = await import("@/features/portal/components/portal-access-dialog");
const { PortalAccessTable } = await import("@/features/portal/components/portal-access-table");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);
const ORG = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(43);

describe("portal access schema", () => {
  const base = { customerId: CUSTOMER, email: "ana@client.md", validDays: "90" };
  it("accepts a customer, an e-mail and a known validity", () => {
    expect(portalAccessSchema.parse(base)).toMatchObject({ validDays: 90, canViewInvoices: true, canViewEstimates: true, canViewProjects: true });
    expect(portalAccessSchema.safeParse({ ...base, validDays: "7" }).error?.issues[0]?.message).toBe("invalidOption");
    expect(portalAccessSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
  it("refuses a link that shares nothing", () => {
    const r = portalAccessSchema.safeParse({ ...base, canViewInvoices: false, canViewEstimates: false, canViewProjects: false });
    expect(r.error?.issues[0]?.message).toBe("portalNothingShared");
  });
  it("tells active, expired and revoked links apart, and checks the token shape", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    expect(portalAccessStatus({ revoked_at: null, expires_at: "2026-12-01T00:00:00Z" }, now)).toBe("active");
    expect(portalAccessStatus({ revoked_at: null, expires_at: "2026-11-09T11:59:59Z" }, now)).toBe("expired");
    expect(portalAccessStatus({ revoked_at: "2026-11-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z" }, now)).toBe("revoked");
    expect(isPortalToken(TOKEN)).toBe(true);
    expect(isPortalToken("short")).toBe(false);
    expect(isPortalToken(`${"a".repeat(42)}/`)).toBe(false);
  });
});

describe("portal service", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(results)) delete results[k];
  });

  it("finds the access by token hash and refuses expired links without loading anything else", async () => {
    results.client_portal_access = { data: { id: "x", organization_id: ORG, customer_id: CUSTOMER, revoked_at: null, expires_at: "2020-01-01T00:00:00Z" }, error: null };
    expect(await resolvePortalAccess(TOKEN)).toEqual({ status: "expired" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.filters).toEqual([["eq", "token_hash", hashInvitationToken(TOKEN)]]);
    expect(await resolvePortalAccess("not-a-token")).toEqual({ status: "invalid" });
  });

  it("scopes every customer query to the organization and customer, and hides drafts", async () => {
    const access = {
      id: "x",
      organizationId: ORG,
      customerId: CUSTOMER,
      customerName: "Ana",
      email: "ana@client.md",
      canViewInvoices: true,
      canViewEstimates: true,
      canViewProjects: false,
      expiresAt: "2027-01-01T00:00:00Z",
      organization: { name: "Constructor SRL" },
    };
    results.invoice_overview = {
      data: [
        { id: "i1", number: "INV-1", status: "issued", currency: "MDL", issue_date: "2026-10-01", due_date: "2026-10-15", total: 1200, amount_paid: 200, balance_due: 1000, is_overdue: true },
        { id: "i2", number: "INV-2", status: "paid", currency: "MDL", issue_date: "2026-09-01", due_date: null, total: 500, amount_paid: 500, balance_due: 0, is_overdue: false },
      ],
      error: null,
    };
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const data = await getPortalOverview(createAdminClient(), access);
    expect(data.projects).toBeNull();
    expect(data.balance).toEqual({ MDL: "1000.00" });
    expect(data.overdue).toBe(1);
    expect(calls.map((c) => c.table)).toEqual(["invoice_overview", "estimates"]);
    for (const c of calls) {
      expect(c.filters).toContainEqual(["eq", "organization_id", ORG]);
      expect(c.filters).toContainEqual(["eq", "customer_id", CUSTOMER]);
      const statuses = c.filters.find((f) => f[0] === "in")?.[2] as string[];
      expect(statuses).not.toContain("draft");
    }
    expect(calls[0]!.filters.find((f) => f[0] === "in")?.[2]).not.toContain("void");
  });
});

describe("PortalAccessDialog", () => {
  // Radix Select needs these browser APIs, which jsdom lacks.
  beforeEach(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
  });

  it("prefills the customer's e-mail, sends the choices and shows the link once", async () => {
    const user = userEvent.setup();
    render(withI18n(<PortalAccessDialog customers={[{ id: CUSTOMER, name: "Ana Popescu", email: "ana@client.md" }]} />));
    await user.click(screen.getByRole("button", { name: "New link" }));
    await user.click(screen.getAllByRole("combobox")[0]!);
    await user.click(screen.getByRole("option", { name: "Ana Popescu" }));
    expect(screen.getByLabelText("Customer e-mail")).toHaveValue("ana@client.md");
    await user.click(screen.getByLabelText("Jobs (projects)"));
    await user.click(screen.getByRole("button", { name: "Create link" }));
    expect(createPortalAccessAction).toHaveBeenCalledWith(expect.objectContaining({ customerId: CUSTOMER, email: "ana@client.md", canViewProjects: false, validDays: 90 }));
    expect(await screen.findByText("The link is ready")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://app.test/portal/abc")).toBeInTheDocument();
    expect(screen.getByText(/E-mail is not configured/)).toBeInTheDocument();
  });

  it("is disabled until there is a customer", () => {
    render(withI18n(<PortalAccessDialog customers={[]} />));
    expect(screen.getByRole("button", { name: "New link" })).toBeDisabled();
  });
});

describe("PortalAccessTable", () => {
  it("offers revoking only for active links", () => {
    const row = { id: "a1", customer_name: "Ana", email: "ana@client.md", can_view_invoices: true, can_view_estimates: false, can_view_projects: true, expires_at: "2027-01-01T00:00:00Z", last_accessed_at: null, status: "active" as const };
    render(withI18n(<PortalAccessTable rows={[row, { ...row, id: "a2", customer_name: "Ion", status: "revoked" }]} />));
    expect(screen.getByRole("button", { name: "Revoke access for Ana" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke access for Ion" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Invoices · Jobs")).toHaveLength(2);
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { assertCan, assignableRoles, can, isRole, PermissionError, permissionsForRole, ROLES } from "@/lib/permissions";
import { NAV_ITEMS, activeNavKey, visibleNavKeys } from "@/config/navigation";
import { resolveActiveOrganizationId } from "@/lib/auth/resolve-active-organization";

describe("permission checks", () => {
  it("grants owners everything", () => {
    expect(permissionsForRole("owner").length).toBeGreaterThan(30);
    expect(can("owner", "billing.manage")).toBe(true);
  });

  it("keeps finance away from employees and writes away from viewers", () => {
    expect(can("employee", "invoices.read")).toBe(false);
    expect(can("employee", "dashboard.financials")).toBe(false);
    expect(can("viewer", "dashboard.financials")).toBe(true);
    expect(can("viewer", "customers.write")).toBe(false);
    expect(can("accountant", "payments.write")).toBe(true);
    expect(can("accountant", "members.manage")).toBe(false);
    expect(can(null, "org.read")).toBe(false);
  });

  it("throws PermissionError from assertCan", () => {
    expect(() => assertCan("viewer", "projects.write")).toThrow(PermissionError);
    expect(() => assertCan("manager", "projects.write")).not.toThrow();
  });

  it("only lets owners assign the owner role", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("manager")).toEqual([]);
  });

  it("validates role strings", () => {
    expect(ROLES.every(isRole)).toBe(true);
    expect(isRole("superadmin")).toBe(false);
  });
});

describe("permission-aware navigation", () => {
  it("has all 17 modules", () => {
    expect(NAV_ITEMS).toHaveLength(17);
  });

  it("hides finance modules from employees", () => {
    const keys = visibleNavKeys("employee");
    expect(keys).toContain("tasks");
    expect(keys).not.toContain("invoices");
    expect(keys).not.toContain("subscription");
  });

  it("shows everything to owners", () => {
    expect(visibleNavKeys("owner")).toHaveLength(17);
  });

  it("selects the longest matching prefix as active", () => {
    const keys = visibleNavKeys("owner");
    expect(activeNavKey("/dashboard", keys)).toBe("dashboard");
    expect(activeNavKey("/dashboard/projects/123", keys)).toBe("projects");
    expect(activeNavKey("/dashboard/settings", keys)).toBe("settings");
  });
});

describe("active organization resolution", () => {
  const memberIds = ["org-a", "org-b"];
  it("honours the cookie only for organizations the user belongs to", () => {
    expect(resolveActiveOrganizationId({ requested: "org-b", lastUsed: "org-a", memberIds })).toBe("org-b");
    expect(resolveActiveOrganizationId({ requested: "org-x", lastUsed: "org-a", memberIds })).toBe("org-a");
    expect(resolveActiveOrganizationId({ requested: "org-x", lastUsed: "org-y", memberIds })).toBe("org-a");
    expect(resolveActiveOrganizationId({ requested: "org-x", lastUsed: null, memberIds: [] })).toBeNull();
  });
});

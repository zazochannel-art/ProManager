/**
 * Role → permission matrix.
 *
 * The DATABASE is the enforcement authority (private.role_permissions + RLS).
 * This file mirrors it so the UI can hide actions a user cannot perform and
 * server actions can fail fast with a clear message. The integration test
 * `tests/integration/permissions-parity.test.ts` fails if the two diverge.
 */
export const ROLES = ["owner", "admin", "manager", "accountant", "employee", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const ALL: readonly Role[] = ROLES;
const MANAGEMENT: readonly Role[] = ["owner", "admin"];
const OPERATIONS: readonly Role[] = ["owner", "admin", "manager"];
const FINANCE_READ: readonly Role[] = ["owner", "admin", "manager", "accountant", "viewer"];

export const PERMISSIONS = {
  "org.read": ALL,
  "org.update": MANAGEMENT,
  "members.read": ALL,
  "members.manage": MANAGEMENT,
  "settings.manage": MANAGEMENT,
  "billing.read": ["owner", "admin", "accountant"],
  "billing.manage": ["owner"],
  "dashboard.financials": FINANCE_READ,
  "customers.read": ALL,
  "customers.write": ["owner", "admin", "manager", "accountant"],
  "customers.delete": MANAGEMENT,
  "projects.read": ALL,
  "projects.write": OPERATIONS,
  "projects.delete": MANAGEMENT,
  "tasks.read": ALL,
  "tasks.write": OPERATIONS,
  "tasks.update_assigned": ["owner", "admin", "manager", "employee"],
  "calendar.read": ALL,
  "calendar.write": OPERATIONS,
  "time.read": ["owner", "admin", "manager", "accountant"],
  "time.write_own": ["owner", "admin", "manager", "employee"],
  "time.manage": OPERATIONS,
  "estimates.read": FINANCE_READ,
  "estimates.write": ["owner", "admin", "manager", "accountant"],
  "estimates.delete": MANAGEMENT,
  "invoices.read": FINANCE_READ,
  "invoices.write": ["owner", "admin", "accountant"],
  "invoices.delete": MANAGEMENT,
  "payments.read": FINANCE_READ,
  "payments.write": ["owner", "admin", "accountant"],
  "expenses.read": FINANCE_READ,
  "expenses.write": ["owner", "admin", "manager", "accountant"],
  "expenses.delete": MANAGEMENT,
  "team.read": ["owner", "admin", "manager", "accountant"],
  "team.manage": MANAGEMENT,
  "inventory.read": ALL,
  "inventory.write": OPERATIONS,
  "suppliers.read": ALL,
  "suppliers.write": ["owner", "admin", "manager", "accountant"],
  "reports.read": FINANCE_READ,
  "documents.read": ALL,
  "documents.write": ["owner", "admin", "manager", "accountant"],
  "documents.delete": MANAGEMENT,
  "portal.manage": OPERATIONS,
  "notifications.read": ALL,
  "automation.manage": MANAGEMENT,
  "activity.read": MANAGEMENT,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

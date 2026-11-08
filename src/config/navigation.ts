import {
  BarChart3,
  Bell,
  Boxes,
  Briefcase,
  CalendarDays,
  CreditCard,
  FileText,
  Gem,
  LayoutDashboard,
  ListChecks,
  Receipt,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission, Role } from "@/lib/permissions";
import { can } from "@/lib/permissions";

export type NavGroup = "overview" | "work" | "finance" | "operations" | "administration";

export type NavKey =
  | "dashboard"
  | "customers"
  | "projects"
  | "tasks"
  | "calendar"
  | "estimates"
  | "invoices"
  | "payments"
  | "expenses"
  | "team"
  | "inventory"
  | "suppliers"
  | "reports"
  | "clientPortal"
  | "notifications"
  | "settings"
  | "subscription";

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Permission required to see the item (and open the page). */
  permission: Permission;
  /** Whether the module's screens are implemented in the current phase. */
  available: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, group: "overview", permission: "org.read", available: true },
  { key: "customers", href: "/dashboard/customers", icon: Users, group: "work", permission: "customers.read", available: true },
  { key: "projects", href: "/dashboard/projects", icon: Briefcase, group: "work", permission: "projects.read", available: true },
  { key: "tasks", href: "/dashboard/tasks", icon: ListChecks, group: "work", permission: "tasks.read", available: true },
  { key: "calendar", href: "/dashboard/calendar", icon: CalendarDays, group: "work", permission: "calendar.read", available: true },
  { key: "estimates", href: "/dashboard/estimates", icon: FileText, group: "finance", permission: "estimates.read", available: false },
  { key: "invoices", href: "/dashboard/invoices", icon: Receipt, group: "finance", permission: "invoices.read", available: false },
  { key: "payments", href: "/dashboard/payments", icon: CreditCard, group: "finance", permission: "payments.read", available: false },
  { key: "expenses", href: "/dashboard/expenses", icon: Wallet, group: "finance", permission: "expenses.read", available: false },
  { key: "team", href: "/dashboard/team", icon: UsersRound, group: "operations", permission: "team.read", available: true },
  { key: "inventory", href: "/dashboard/inventory", icon: Boxes, group: "operations", permission: "inventory.read", available: false },
  { key: "suppliers", href: "/dashboard/suppliers", icon: Truck, group: "operations", permission: "suppliers.read", available: false },
  { key: "reports", href: "/dashboard/reports", icon: BarChart3, group: "operations", permission: "reports.read", available: false },
  { key: "clientPortal", href: "/dashboard/client-portal", icon: ShieldCheck, group: "operations", permission: "portal.manage", available: false },
  { key: "notifications", href: "/dashboard/notifications", icon: Bell, group: "administration", permission: "notifications.read", available: true },
  { key: "settings", href: "/dashboard/settings", icon: Settings, group: "administration", permission: "org.read", available: true },
  { key: "subscription", href: "/dashboard/subscription", icon: Gem, group: "administration", permission: "billing.read", available: true },
];

export const NAV_GROUP_ORDER: readonly NavGroup[] = ["overview", "work", "finance", "operations", "administration"];

/** Permission-aware navigation: only items the role may open. */
export function visibleNavKeys(role: Role): NavKey[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission)).map((item) => item.key);
}

export function navItemByKey(key: NavKey): NavItem {
  const item = NAV_ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`Unknown navigation key: ${key}`);
  return item;
}

/** Longest-prefix match so /dashboard/projects/123 highlights "projects", not "dashboard". */
export function activeNavKey(pathname: string, keys: readonly NavKey[]): NavKey | null {
  let best: NavItem | null = null;
  for (const item of NAV_ITEMS) {
    if (!keys.includes(item.key)) continue;
    const match = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (match && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key ?? null;
}

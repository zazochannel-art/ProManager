import type { Metadata } from "next";
import Link from "next/link";
import { BadgeAlert, KeyRound, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils/cn";
import { CURRENCIES, type CurrencyCode } from "@/config/site";
import { listMembers } from "@/features/settings/services/members-service";
import { listEmployees } from "@/features/employees/services/employee-service";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/features/employees/schemas/employee";
import { EmployeesList } from "@/features/employees/components/employees-list";
import { EmployeeDialog, type EmployeeFormValues } from "@/features/employees/components/employee-dialog";

export const metadata: Metadata = { title: "Team" };

const isCurrency = (v: string | null): v is CurrencyCode => v !== null && (CURRENCIES as readonly string[]).includes(v);
const isType = (v: string): v is EmploymentType => (EMPLOYMENT_TYPES as readonly string[]).includes(v);

export default async function TeamPage({ searchParams }: PageProps<"/dashboard/team">) {
  const ctx = await requirePagePermission("team.read");
  const { t } = await getI18n();
  const showAll = (await searchParams).show === "all";
  const supabase = await createClient();
  const canManage = ctx.can("team.manage");
  const [employees, members] = await Promise.all([
    listEmployees(supabase, ctx.organization.id, { includeInactive: showAll }),
    listMembers(supabase, ctx.organization.id),
  ]);

  const rows: EmployeeFormValues[] = employees.map((e) => ({
    ...e,
    employment_type: isType(e.employment_type) ? e.employment_type : "full_time",
    hourly_cost: e.hourly_cost === null ? null : String(e.hourly_cost),
    cost_currency: isCurrency(e.cost_currency) ? e.cost_currency : null,
  }));
  const accounts = members.filter((m) => m.status === "active").map((m) => ({ userId: m.userId, name: m.name || m.email }));
  const active = rows.filter((r) => r.is_active);
  const linkedIds = new Set(rows.flatMap((r) => (r.user_id ? [r.user_id] : [])));
  const freeAccounts = accounts.filter((a) => !linkedIds.has(a.userId));
  const createButton = canManage ? <EmployeeDialog accounts={freeAccounts} defaultCurrency={ctx.currency} /> : null;

  return (
    <>
      <PageHeader title={t.employees.title} description={t.employees.description} actions={createButton} />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
        <StatCard label={t.employees.stats.active} value={String(active.length)} icon={UsersRound} tone="primary" />
        <StatCard label={t.employees.stats.withAccount} value={String(active.filter((r) => r.user_id).length)} icon={KeyRound} tone="success" />
        <StatCard
          label={t.employees.stats.noRate}
          value={String(active.filter((r) => !r.hourly_cost).length)}
          hint={t.employees.stats.noRateHint}
          icon={BadgeAlert}
          tone={active.some((r) => !r.hourly_cost) ? "warning" : "success"}
        />
      </div>
      <nav aria-label={t.employees.filter} className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1 shadow-sm">
        {[
          { key: "active", href: "/dashboard/team", label: t.employees.showActive, current: !showAll },
          { key: "all", href: "/dashboard/team?show=all", label: t.employees.showAll, current: showAll },
        ].map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.current ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              item.current ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={UsersRound} title={t.employees.empty} description={t.employees.emptyBody} action={createButton} />
      ) : (
        <EmployeesList employees={rows} accounts={accounts} canManage={canManage} defaultCurrency={ctx.currency} />
      )}
    </>
  );
}

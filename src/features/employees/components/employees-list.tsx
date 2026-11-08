"use client";

import { Mail, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency/format";
import type { CurrencyCode } from "@/config/site";
import { EmployeeDialog, type EmployeeFormValues } from "./employee-dialog";

export function EmployeesList({
  employees,
  accounts,
  canManage,
  defaultCurrency,
}: {
  employees: EmployeeFormValues[];
  /** Organization members, for names and for linking. */
  accounts: { userId: string; name: string }[];
  canManage: boolean;
  defaultCurrency: CurrencyCode;
}) {
  const { t, locale } = useI18n();
  const accountName = new Map(accounts.map((a) => [a.userId, a.name]));
  const linked = new Set(employees.flatMap((e) => (e.user_id ? [e.user_id] : [])));

  return (
    <ul className="divide-y divide-border rounded-xl border border-border/80 bg-surface shadow-sm">
      {employees.map((e) => {
        const name = `${e.first_name} ${e.last_name}`.trim();
        // An account can be linked to one employee only: offer free accounts plus this employee's own.
        const linkable = accounts.filter((a) => !linked.has(a.userId) || a.userId === e.user_id);
        return (
          <li key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={name} className="size-10 text-sm" />
              <div className="min-w-0">
                <p className={e.is_active ? "truncate font-medium" : "truncate font-medium text-muted-foreground"}>{name}</p>
                <p className="truncate text-sm text-muted-foreground">{e.position ?? t.employees.types[e.employment_type]}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {e.email ? (
                    <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:${e.email}`}>
                      <Mail className="size-3.5" aria-hidden="true" />
                      {e.email}
                    </a>
                  ) : null}
                  {e.phone ? (
                    <a className="inline-flex items-center gap-1 hover:text-foreground" href={`tel:${e.phone}`}>
                      <Phone className="size-3.5" aria-hidden="true" />
                      {e.phone}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {e.is_active ? null : <Badge variant="neutral">{t.employees.inactive}</Badge>}
              <Badge variant="outline">{t.employees.types[e.employment_type]}</Badge>
              {e.user_id ? (
                <Badge variant="primary">{interpolate(t.employees.linkedTo, { name: accountName.get(e.user_id) ?? "—" })}</Badge>
              ) : null}
              <span className="min-w-28 text-right text-sm font-semibold tabular-nums">
                {e.hourly_cost && e.cost_currency ? (
                  interpolate(t.employees.perHour, { amount: formatMoney(e.hourly_cost, e.cost_currency, locale) })
                ) : (
                  <span className="font-normal text-warning">{t.employees.noRate}</span>
                )}
              </span>
              {canManage ? <EmployeeDialog employee={e} accounts={linkable} defaultCurrency={defaultCurrency} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import Link from "next/link";
import { CircleCheck, FileText, ReceiptText, TriangleAlert, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/shared/stat-card";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/config/site";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency/format";
import { formatAmountsByCurrency } from "@/lib/currency/amounts";
import { formatDate } from "@/lib/utils/dates";
import { ESTIMATE_STATUS_VARIANT, INVOICE_STATUS_VARIANT } from "@/features/invoicing/schemas/document";
import { PROJECT_STATUS_VARIANT, PROJECT_STATUSES, type ProjectStatus } from "@/features/projects/schemas/project";
import type { PortalAccess, PortalOverview as PortalOverviewData } from "../services/portal-service";
import { PortalShell } from "./portal-shell";

const isProjectStatus = (v: string): v is ProjectStatus => (PROJECT_STATUSES as readonly string[]).includes(v);

/** The customer's home in the portal: amount due, invoices, estimates and jobs. */
export function PortalOverview({ token, access, data, t, locale }: { token: string; access: PortalAccess; data: PortalOverviewData; t: Dictionary; locale: Locale }) {
  const base = `/portal/${token}`;
  const date = (v: string | null) => (v ? formatDate(v, locale) : "—");
  const money = (v: string, c: string) => formatMoney(v, c, locale);
  const balanceText = formatAmountsByCurrency(data.balance, Object.keys(data.balance)[0] ?? "", locale);
  const openCount = (data.invoices ?? []).filter((i) => i.status !== "paid" && Number(i.balance_due) > 0).length;

  return (
    <PortalShell access={access} t={t} locale={locale}>
      <h1 className="text-2xl font-semibold tracking-tight">{interpolate(t.portal.greeting, { customer: access.customerName })}</h1>
      <p className="mt-1 text-muted-foreground">{interpolate(t.portal.from, { organization: access.organization.name })}</p>

      {data.invoices ? (
        <section className="mt-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <StatCard
            label={t.portal.balance}
            value={balanceText ?? t.portal.balanceNone}
            hint={openCount > 0 ? interpolate(t.portal.openInvoices, { count: openCount }) : t.portal.allPaid}
            icon={Wallet}
            tone={balanceText ? "primary" : "success"}
          />
          <StatCard
            label={t.portal.overdueTitle}
            value={String(data.overdue)}
            hint={data.overdue > 0 ? t.portal.overdueHint : t.portal.allPaid}
            icon={data.overdue > 0 ? TriangleAlert : CircleCheck}
            tone={data.overdue > 0 ? "danger" : "neutral"}
          />
        </section>
      ) : null}

      <div className="mt-6 flex flex-col gap-6">
        {data.invoices ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText aria-hidden="true" className="size-4 text-primary" />
                {t.portal.invoices}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.portal.noInvoices}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="whitespace-nowrap">
                      <TableRow>
                        <TableHead>{t.portal.number}</TableHead>
                        <TableHead>{t.portal.issueDate}</TableHead>
                        <TableHead>{t.portal.dueDate}</TableHead>
                        <TableHead className="text-right">{t.portal.total}</TableHead>
                        <TableHead className="text-right">{t.portal.balanceDue}</TableHead>
                        <TableHead>{t.clientPortal.columns.status}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.invoices.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>
                            <Link href={`${base}/invoices/${i.id}`} className="font-mono font-medium whitespace-nowrap text-primary hover:underline" aria-label={interpolate(t.portal.open, { name: i.number ?? "" })}>
                              {i.number}
                            </Link>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{date(i.issue_date)}</TableCell>
                          <TableCell className={i.is_overdue ? "whitespace-nowrap font-medium text-danger" : "whitespace-nowrap"}>{date(i.due_date)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap tabular-nums">{money(i.total, i.currency)}</TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{Number(i.balance_due) > 0 ? money(i.balance_due, i.currency) : "—"}</TableCell>
                          <TableCell>
                            <span className="flex flex-wrap gap-1.5">
                              <Badge variant={INVOICE_STATUS_VARIANT[i.status]}>{t.invoices.statuses[i.status]}</Badge>
                              {i.is_overdue ? <Badge variant="danger">{t.portal.overdueBadge}</Badge> : null}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {data.estimates ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText aria-hidden="true" className="size-4 text-primary" />
                {t.portal.estimates}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.estimates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.portal.noEstimates}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="whitespace-nowrap">
                      <TableRow>
                        <TableHead>{t.portal.number}</TableHead>
                        <TableHead>{t.portal.issueDate}</TableHead>
                        <TableHead>{t.portal.validUntil}</TableHead>
                        <TableHead className="text-right">{t.portal.total}</TableHead>
                        <TableHead>{t.clientPortal.columns.status}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.estimates.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <Link href={`${base}/estimates/${e.id}`} className="flex flex-col hover:underline" aria-label={interpolate(t.portal.open, { name: e.number ?? e.title ?? "" })}>
                              <span className="font-mono font-medium whitespace-nowrap text-primary">{e.number}</span>
                              {e.title ? <span className="max-w-64 truncate text-xs text-muted-foreground">{e.title}</span> : null}
                            </Link>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{date(e.issue_date)}</TableCell>
                          <TableCell className="whitespace-nowrap">{date(e.valid_until)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap tabular-nums">{money(e.total, e.currency)}</TableCell>
                          <TableCell>
                            <Badge variant={ESTIMATE_STATUS_VARIANT[e.status]}>{t.estimates.statuses[e.status]}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {data.projects ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.portal.projects}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.portal.noProjects}</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.projects.map((p) => (
                    <li key={p.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{p.name}</p>
                        {isProjectStatus(p.status) ? <Badge variant={PROJECT_STATUS_VARIANT[p.status]}>{t.projects.statuses[p.status]}</Badge> : null}
                      </div>
                      <dl className="mt-2 grid gap-1 text-sm">
                        {p.start_date || p.end_date ? (
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground">{t.portal.period}:</dt>
                            <dd>
                              {date(p.start_date)} – {date(p.end_date)}
                            </dd>
                          </div>
                        ) : null}
                        {p.site_address ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">{t.portal.site}:</dt>
                            <dd className="min-w-0">{p.site_address}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PortalShell>
  );
}

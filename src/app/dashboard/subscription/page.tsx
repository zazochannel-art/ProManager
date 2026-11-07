import type { Metadata } from "next";
import { Gem } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { formatMoney, formatNumber } from "@/lib/currency/format";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { getSubscriptionOverview } from "@/features/billing/services/subscription-service";

export const metadata: Metadata = { title: "Subscription" };

export default async function SubscriptionPage() {
  const ctx = await requirePagePermission("billing.read");
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const overview = await getSubscriptionOverview(supabase, ctx.organization.id);

  if (!overview) {
    return (
      <>
        <PageHeader title={t.subscription.title} description={t.subscription.description} />
        <EmptyState icon={Gem} title={t.subscription.noSubscription} />
      </>
    );
  }

  const { plan, usage } = overview;
  const statusLabel = (t.subscription.statuses as Record<string, string>)[overview.status] ?? overview.status;
  const storageMb = usage.storageBytes / (1024 * 1024);
  const rows: { label: string; used: number; limit: number | undefined; format?: (v: number) => string }[] = [
    { label: t.subscription.members, used: usage.members, limit: plan.limits.max_members },
    { label: t.subscription.projects, used: usage.projects, limit: plan.limits.max_projects },
    { label: t.subscription.customers, used: usage.customers, limit: plan.limits.max_customers },
    { label: t.subscription.storage, used: storageMb, limit: plan.limits.storage_mb, format: (v) => `${formatNumber(v, locale, 1)} MB` },
  ];

  return (
    <>
      <PageHeader title={t.subscription.title} description={t.subscription.description} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t.subscription.currentPlan}</CardDescription>
            <CardTitle className="text-xl">{plan.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {plan.description ? <p className="text-sm text-muted-foreground">{plan.description}</p> : null}
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(plan.priceAmount, plan.priceCurrency, locale)} <span className="text-sm font-normal text-muted-foreground">{t.subscription.perMonth}</span>
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t.subscription.status}:</span>
              <Badge variant={overview.status === "past_due" ? "danger" : overview.status === "active" ? "success" : "primary"}>{statusLabel}</Badge>
            </div>
            {overview.status === "trialing" && overview.trialEndsAt ? (
              <p className="text-sm text-muted-foreground">{interpolate(t.subscription.trialEnds, { date: formatDate(overview.trialEndsAt, locale) })}</p>
            ) : null}
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t.subscription.billingNote}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.subscription.limits}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-5">
              {rows.map((row) => {
                const percent = row.limit ? Math.min(100, (row.used / row.limit) * 100) : 0;
                const fmt = row.format ?? ((v: number) => String(v));
                return (
                  <li key={row.label}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-medium">{row.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {row.limit === undefined ? fmt(row.used) : interpolate(t.subscription.usage, { used: fmt(row.used), limit: fmt(row.limit) })}
                      </span>
                    </div>
                    {row.limit !== undefined ? (
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={row.label}
                        aria-valuemin={0}
                        aria-valuemax={row.limit}
                        aria-valuenow={Math.round(row.used)}
                      >
                        <div className={cn("h-full rounded-full", percent >= 90 ? "bg-danger" : percent >= 75 ? "bg-warning" : "bg-primary")} style={{ width: `${percent}%` }} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

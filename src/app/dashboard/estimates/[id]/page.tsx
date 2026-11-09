import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarClock, FileText, ListOrdered, Receipt, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { DetailHero } from "@/components/shared/detail-hero";
import { StatCard } from "@/components/shared/stat-card";
import { CURRENCIES, type CurrencyCode } from "@/config/site";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency/format";
import { formatDate, todayInTimeZone } from "@/lib/utils/dates";
import { uuidField } from "@/lib/validation/common";
import { listCustomerOptions } from "@/features/customers/services/customer-service";
import {
  getCustomerParty,
  getEstimate,
  listApplicableTaxRates,
  listDocumentLines,
  listProjectPickerOptions,
  partyFromOrganization,
} from "@/features/invoicing/services/invoicing-service";
import { ESTIMATE_STATUS_VARIANT, estimateLinesEditable } from "@/features/invoicing/schemas/document";
import { DocumentLines } from "@/features/invoicing/components/document-lines";
import { DocumentHeaderDialog } from "@/features/invoicing/components/document-header-dialog";
import { EstimateWorkflow } from "@/features/invoicing/components/estimate-workflow";
import { PrintButton } from "@/features/invoicing/components/invoice-workflow";
import { PrintableDocument } from "@/features/invoicing/components/printable-document";

export const metadata: Metadata = { title: "Estimate" };

const isCurrency = (v: string): v is CurrencyCode => (CURRENCIES as readonly string[]).includes(v);

export default async function EstimateDetailPage({ params }: PageProps<"/dashboard/estimates/[id]">) {
  const ctx = await requirePagePermission("estimates.read");
  const { id } = await params;
  if (!uuidField.safeParse(id).success) notFound();
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const estimate = await getEstimate(supabase, ctx.organization.id, id);
  if (!estimate) notFound();

  const canWrite = ctx.can("estimates.write");
  const today = todayInTimeZone(ctx.settings.timezone);
  const linesEditable = estimateLinesEditable(estimate.status);
  const [lines, taxRates, customers, projects, customerParty] = await Promise.all([
    listDocumentLines(supabase, ctx.organization.id, "estimate", id),
    canWrite && linesEditable ? listApplicableTaxRates(supabase, ctx.organization.id, today) : Promise.resolve([]),
    canWrite && linesEditable && ctx.can("customers.read") ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite && linesEditable && ctx.can("projects.read") ? listProjectPickerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    ctx.can("customers.read") ? getCustomerParty(supabase, ctx.organization.id, estimate.customer_id) : Promise.resolve(null),
  ]);

  const currency: CurrencyCode = isCurrency(estimate.currency) ? estimate.currency : ctx.currency;
  const money = (v: string) => formatMoney(v, currency, locale);
  const title = estimate.number ?? t.estimates.title;
  const validityDays = estimate.valid_until ? Math.round((Date.parse(estimate.valid_until) - Date.parse(today)) / 86_400_000) : null;
  const open = estimate.status === "draft" || estimate.status === "sent";
  const expired = open && validityDays !== null && validityDays < 0;
  const defaultTaxRate = taxRates.find((r) => r.is_default)?.rate ?? taxRates[0]?.rate ?? "0";

  const details: { label: string; value: React.ReactNode }[] = [
    {
      label: t.invoicing.customer,
      value: estimate.customer_name ? (
        <Link className="text-primary hover:underline" href={`/dashboard/customers/${estimate.customer_id}`}>
          {estimate.customer_name}
        </Link>
      ) : null,
    },
    {
      label: t.invoicing.project,
      value:
        estimate.project_id && estimate.project_name ? (
          <Link className="text-primary hover:underline" href={`/dashboard/projects/${estimate.project_id}`}>
            {estimate.project_name}
          </Link>
        ) : (
          t.invoicing.noProject
        ),
    },
    { label: t.invoicing.issueDate, value: formatDate(estimate.issue_date, locale) },
    { label: t.estimates.validUntil, value: formatDate(estimate.valid_until, locale) },
    { label: t.invoicing.currency, value: currency },
  ];

  return (
    <>
      <div className="print:hidden">
        <DetailHero
          title={title}
          icon={FileText}
          meta={
            <>
              <Badge variant={ESTIMATE_STATUS_VARIANT[estimate.status]}>{t.estimates.statuses[estimate.status]}</Badge>
              {estimate.title ? <span>{estimate.title}</span> : null}
              {estimate.customer_name ? (
                <Link className="inline-flex items-center gap-1.5 hover:text-foreground" href={`/dashboard/customers/${estimate.customer_id}`}>
                  <Building2 className="size-3.5" aria-hidden="true" />
                  {estimate.customer_name}
                </Link>
              ) : null}
              {estimate.converted_invoice_id ? (
                <Link className="inline-flex items-center gap-1.5 text-primary hover:underline" href={`/dashboard/invoices/${estimate.converted_invoice_id}`}>
                  <Receipt className="size-3.5" aria-hidden="true" />
                  {interpolate(t.estimates.convertedTo, { number: estimate.converted_invoice_number ?? t.estimates.draftInvoice })}
                </Link>
              ) : null}
            </>
          }
          breadcrumb={<Breadcrumb label={t.common.breadcrumb} items={[{ label: t.estimates.title, href: "/dashboard/estimates" }, { label: title }]} />}
          actions={
            <>
              {lines.length > 0 ? <PrintButton /> : null}
              {canWrite && linesEditable ? (
                <DocumentHeaderDialog
                  kind="estimate"
                  documentId={estimate.id}
                  options={{ customers, projects }}
                  initialValues={{
                    customerId: estimate.customer_id,
                    projectId: estimate.project_id ?? "none",
                    currency,
                    issueDate: estimate.issue_date,
                    validUntil: estimate.valid_until ?? "",
                    title: estimate.title ?? "",
                    notes: estimate.notes ?? "",
                    terms: estimate.terms ?? "",
                  }}
                />
              ) : null}
              <EstimateWorkflow
                estimateId={estimate.id}
                status={estimate.status}
                hasLines={lines.length > 0}
                canWrite={canWrite}
                canConvert={ctx.can("invoices.write")}
                canDelete={ctx.can("estimates.delete")}
              />
            </>
          }
        />
        <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
          <StatCard label={t.estimates.stats.total} value={money(estimate.total)} icon={Wallet} tone="primary" />
          <StatCard
            label={t.estimates.stats.validity}
            value={estimate.valid_until ? formatDate(estimate.valid_until, locale) : "—"}
            hint={open && validityDays !== null ? (expired ? t.estimates.stats.expired : interpolate(t.estimates.stats.daysLeft, { days: validityDays })) : undefined}
            icon={CalendarClock}
            tone={expired ? "danger" : "warning"}
          />
          <StatCard label={t.estimates.stats.lines} value={String(lines.length)} icon={ListOrdered} tone="success" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
            <DocumentLines
              kind="estimate"
              documentId={estimate.id}
              currency={currency}
              lines={lines}
              totals={estimate}
              editable={canWrite && linesEditable}
              lockedMessage={!linesEditable ? t.estimates.locked : expired ? t.estimates.expiredHint : undefined}
              defaultTaxRate={defaultTaxRate}
              taxRates={taxRates}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t.invoicing.details}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-y-4 text-sm">
                  {details.map((d) => (
                    <div key={d.label} className="min-w-0">
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd className="mt-0.5 truncate font-medium">{d.value ?? "—"}</dd>
                    </div>
                  ))}
                  {estimate.notes ? (
                    <div>
                      <dt className="text-muted-foreground">{t.invoicing.notes}</dt>
                      <dd className="mt-0.5 whitespace-pre-line">{estimate.notes}</dd>
                    </div>
                  ) : null}
                  {estimate.terms ? (
                    <div>
                      <dt className="text-muted-foreground">{t.invoicing.terms}</dt>
                      <dd className="mt-0.5 whitespace-pre-line">{estimate.terms}</dd>
                    </div>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <PrintableDocument
        t={t}
        locale={locale}
        heading={t.estimates.documentHeading}
        number={title}
        dates={[
          { label: t.invoicing.issueDate, value: estimate.issue_date },
          { label: t.estimates.validUntil, value: estimate.valid_until },
        ]}
        supplier={partyFromOrganization(ctx.organization as unknown as Record<string, unknown>)}
        customer={customerParty ?? (estimate.customer_name ? { name: estimate.customer_name, taxId: null, registrationNumber: null, lines: [] } : null)}
        lines={lines}
        totals={estimate}
        currency={currency}
        notes={estimate.notes}
        terms={estimate.terms}
        footer={estimate.title ?? undefined}
      />
    </>
  );
}

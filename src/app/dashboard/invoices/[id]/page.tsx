import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Building2, CalendarClock, CheckCircle2, FileText, HandCoins, Receipt, Wallet } from "lucide-react";
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
  getInvoice,
  getInvoiceSnapshots,
  listApplicableTaxRates,
  listDocumentLines,
  listInvoicePayments,
  listProjectPickerOptions,
  partyFromCustomerSnapshot,
  partyFromOrganization,
} from "@/features/invoicing/services/invoicing-service";
import { INVOICE_STATUS_VARIANT, invoiceEditable, invoiceOpenForPayment } from "@/features/invoicing/schemas/document";
import { DocumentLines } from "@/features/invoicing/components/document-lines";
import { DocumentHeaderDialog } from "@/features/invoicing/components/document-header-dialog";
import { InvoiceWorkflow } from "@/features/invoicing/components/invoice-workflow";
import { InvoicePayments } from "@/features/invoicing/components/invoice-payments";
import { PrintableDocument } from "@/features/invoicing/components/printable-document";

export const metadata: Metadata = { title: "Invoice" };

const isCurrency = (v: string): v is CurrencyCode => (CURRENCIES as readonly string[]).includes(v);

export default async function InvoiceDetailPage({ params }: PageProps<"/dashboard/invoices/[id]">) {
  const ctx = await requirePagePermission("invoices.read");
  const { id } = await params;
  if (!uuidField.safeParse(id).success) notFound();
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const invoice = await getInvoice(supabase, ctx.organization.id, id);
  if (!invoice) notFound();

  const canWrite = ctx.can("invoices.write");
  const editable = invoiceEditable(invoice.status);
  const today = todayInTimeZone(ctx.settings.timezone);
  const [lines, payments, taxRates, customers, projects, snapshots, liveCustomer] = await Promise.all([
    listDocumentLines(supabase, ctx.organization.id, "invoice", id),
    ctx.can("payments.read") ? listInvoicePayments(supabase, ctx.organization.id, id) : Promise.resolve(null),
    canWrite && editable ? listApplicableTaxRates(supabase, ctx.organization.id, invoice.issue_date) : Promise.resolve([]),
    canWrite && editable && ctx.can("customers.read") ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite && editable && ctx.can("projects.read") ? listProjectPickerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    getInvoiceSnapshots(supabase, ctx.organization.id, id),
    editable && ctx.can("customers.read") ? getCustomerParty(supabase, ctx.organization.id, invoice.customer_id) : Promise.resolve(null),
  ]);

  const currency: CurrencyCode = isCurrency(invoice.currency) ? invoice.currency : ctx.currency;
  const money = (v: string) => formatMoney(v, currency, locale);
  const title = invoice.number ?? t.invoices.draftNumber;
  const open = invoiceOpenForPayment(invoice.status);
  const dueDays = invoice.due_date ? Math.round((Date.parse(invoice.due_date) - Date.parse(today)) / 86_400_000) : null;
  const dueHint =
    !open || dueDays === null
      ? undefined
      : dueDays > 0
        ? interpolate(t.invoices.stats.dueIn, { days: dueDays })
        : dueDays === 0
          ? t.invoices.stats.dueToday
          : interpolate(t.invoices.stats.overdueBy, { days: -dueDays });
  const defaultTaxRate = taxRates.find((r) => r.is_default)?.rate ?? taxRates[0]?.rate ?? "0";
  const hasActivePayments = (payments ?? []).some((p) => !p.voided_at);

  const supplier = partyFromOrganization(snapshots.organization ?? (ctx.organization as unknown as Record<string, unknown>));
  const customerParty = snapshots.customer ? partyFromCustomerSnapshot(snapshots.customer) : liveCustomer;

  const details: { label: string; value: React.ReactNode }[] = [
    {
      label: t.invoicing.customer,
      value: invoice.customer_name ? (
        <Link className="text-primary hover:underline" href={`/dashboard/customers/${invoice.customer_id}`}>
          {invoice.customer_name}
        </Link>
      ) : null,
    },
    {
      label: t.invoicing.project,
      value:
        invoice.project_id && invoice.project_name ? (
          <Link className="text-primary hover:underline" href={`/dashboard/projects/${invoice.project_id}`}>
            {invoice.project_name}
          </Link>
        ) : (
          t.invoicing.noProject
        ),
    },
    { label: t.invoicing.issueDate, value: formatDate(invoice.issue_date, locale) },
    { label: t.invoices.dueDate, value: invoice.due_date ? formatDate(invoice.due_date, locale) : editable ? t.invoices.dueDateHint : null },
    { label: t.invoicing.currency, value: currency },
  ];

  return (
    <>
      <div className="print:hidden">
        <DetailHero
          title={title}
          icon={Receipt}
          meta={
            <>
              <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>{t.invoices.statuses[invoice.status]}</Badge>
              {invoice.is_overdue ? <Badge variant="danger">{t.invoices.overdue}</Badge> : null}
              {invoice.customer_name ? (
                <Link className="inline-flex items-center gap-1.5 hover:text-foreground" href={`/dashboard/customers/${invoice.customer_id}`}>
                  <Building2 className="size-3.5" aria-hidden="true" />
                  {invoice.customer_name}
                </Link>
              ) : null}
              {invoice.estimate_id && ctx.can("estimates.read") ? (
                <Link className="inline-flex items-center gap-1.5 text-primary hover:underline" href={`/dashboard/estimates/${invoice.estimate_id}`}>
                  <FileText className="size-3.5" aria-hidden="true" />
                  {interpolate(t.invoices.fromEstimate, { number: invoice.estimate_number ?? "" })}
                </Link>
              ) : null}
            </>
          }
          breadcrumb={<Breadcrumb label={t.common.breadcrumb} items={[{ label: t.invoices.title, href: "/dashboard/invoices" }, { label: title }]} />}
          actions={
            <>
              {canWrite && editable ? (
                <DocumentHeaderDialog
                  kind="invoice"
                  documentId={invoice.id}
                  options={{ customers, projects }}
                  initialValues={{
                    customerId: invoice.customer_id,
                    projectId: invoice.project_id ?? "none",
                    currency,
                    issueDate: invoice.issue_date,
                    dueDate: invoice.due_date ?? "",
                    notes: invoice.notes ?? "",
                    terms: invoice.terms ?? "",
                  }}
                />
              ) : null}
              <InvoiceWorkflow
                invoiceId={invoice.id}
                status={invoice.status}
                hasLines={lines.length > 0}
                hasPayments={hasActivePayments || Number(invoice.amount_paid) > 0}
                fromEstimate={invoice.estimate_id !== null}
                canWrite={canWrite}
                canDelete={ctx.can("invoices.delete")}
              />
            </>
          }
        />
        {invoice.status === "void" ? (
          <p className="mb-6 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {interpolate(t.invoices.voidedNote, { date: formatDate(invoice.voided_at, locale), reason: invoice.void_reason ?? "—" })}
          </p>
        ) : null}
        {invoice.status === "paid" && invoice.paid_at ? (
          <p className="mb-6 flex items-start gap-2 rounded-xl border border-success/20 bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {interpolate(t.invoices.paidInFull, { date: formatDate(invoice.paid_at, locale) })}
          </p>
        ) : null}
        <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t.invoicing.total} value={money(invoice.total)} icon={Wallet} tone="primary" />
          <StatCard label={t.invoices.amountPaid} value={money(invoice.amount_paid)} icon={HandCoins} tone="success" />
          <StatCard
            label={t.invoices.balance}
            value={invoice.status === "void" ? "—" : money(invoice.balance_due)}
            icon={Receipt}
            tone={invoice.is_overdue ? "danger" : "warning"}
          />
          <StatCard
            label={t.invoices.dueDate}
            value={invoice.due_date ? formatDate(invoice.due_date, locale) : "—"}
            hint={dueHint}
            icon={CalendarClock}
            tone={invoice.is_overdue ? "danger" : "neutral"}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
            <DocumentLines
              kind="invoice"
              documentId={invoice.id}
              currency={currency}
              lines={lines}
              totals={invoice}
              editable={canWrite && editable}
              lockedMessage={editable ? (lines.length === 0 && canWrite ? t.invoices.needsLines : undefined) : t.invoices.locked}
              defaultTaxRate={defaultTaxRate}
              taxRates={taxRates}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            {payments ? (
              <InvoicePayments
                invoiceId={invoice.id}
                invoiceNumber={title}
                currency={currency}
                balanceDue={invoice.balance_due}
                payments={payments}
                openForPayment={open}
                issued={invoice.status !== "draft"}
                canWrite={ctx.can("payments.write")}
                today={today}
              />
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>{t.invoicing.details}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-y-4 text-sm">
                  {details.map((d) => (
                    <div key={d.label} className="min-w-0">
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd className="mt-0.5 font-medium break-words">{d.value ?? "—"}</dd>
                    </div>
                  ))}
                  {invoice.notes ? (
                    <div>
                      <dt className="text-muted-foreground">{t.invoicing.notes}</dt>
                      <dd className="mt-0.5 whitespace-pre-line">{invoice.notes}</dd>
                    </div>
                  ) : null}
                  {invoice.terms ? (
                    <div>
                      <dt className="text-muted-foreground">{t.invoicing.terms}</dt>
                      <dd className="mt-0.5 whitespace-pre-line">{invoice.terms}</dd>
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
        heading={t.invoices.documentHeading}
        number={title}
        dates={[
          { label: t.invoicing.issueDate, value: invoice.issue_date },
          { label: t.invoices.dueDate, value: invoice.due_date },
        ]}
        supplier={supplier}
        customer={customerParty ?? (invoice.customer_name ? { name: invoice.customer_name, taxId: null, registrationNumber: null, lines: [] } : null)}
        lines={lines}
        totals={invoice}
        currency={currency}
        notes={invoice.notes}
        terms={invoice.terms}
      />
    </>
  );
}

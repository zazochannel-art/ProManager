import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/currency/format";
import { uuidField } from "@/lib/validation/common";
import { ESTIMATE_STATUS_VARIANT, INVOICE_STATUS_VARIANT, type EstimateStatus, type InvoiceStatus } from "@/features/invoicing/schemas/document";
import { PrintableDocument } from "@/features/invoicing/components/printable-document";
import { getPortalDocument, resolvePortalAccess, type PortalAccess, type PortalDocument } from "../services/portal-service";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/config/site";
import { PortalShell, PortalUnavailable } from "./portal-shell";
import { PrintButton } from "./print-button";

/** One invoice or estimate, as the customer sees it, ready to print or save as PDF. */
export async function PortalDocumentPage({ token, id, kind }: { token: string; id: string; kind: "invoice" | "estimate" }) {
  const { t, locale } = await getI18n();
  const resolved = await resolvePortalAccess(token);
  if (resolved.status !== "ok") return <PortalUnavailable status={resolved.status} t={t} />;
  if (!uuidField.safeParse(id).success) notFound();
  const doc = await getPortalDocument(resolved.admin, resolved.access, kind, id);
  if (!doc) notFound();
  return <PortalDocumentView token={token} access={resolved.access} doc={doc} kind={kind} t={t} locale={locale} />;
}

export function PortalDocumentView({ token, access, doc, kind, t, locale }: { token: string; access: PortalAccess; doc: PortalDocument; kind: "invoice" | "estimate"; t: Dictionary; locale: Locale }) {
  const money = (v: string) => formatMoney(v, doc.currency, locale);
  const heading = kind === "invoice" ? t.invoices.documentHeading : t.estimates.documentHeading;
  const badge =
    kind === "invoice" ? (
      <Badge variant={INVOICE_STATUS_VARIANT[doc.status as InvoiceStatus]}>{t.invoices.statuses[doc.status as InvoiceStatus]}</Badge>
    ) : (
      <Badge variant={ESTIMATE_STATUS_VARIANT[doc.status as EstimateStatus]}>{t.estimates.statuses[doc.status as EstimateStatus]}</Badge>
    );

  return (
    <PortalShell access={access} t={t} locale={locale}>
      <div className="print:hidden">
        <Link href={`/portal/${token}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t.portal.back}
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {heading} <span className="font-mono">{doc.number}</span>
            </h1>
            {badge}
            {doc.is_overdue ? <Badge variant="danger">{t.portal.overdueBadge}</Badge> : null}
          </div>
          <PrintButton label={t.portal.print} />
        </div>
        {doc.balance_due !== null ? (
          <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{t.portal.total}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{money(doc.total)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t.portal.paid}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{money(doc.amount_paid ?? "0")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t.portal.balanceDue}</dt>
              <dd className={Number(doc.balance_due) > 0 ? "mt-0.5 font-semibold tabular-nums text-primary" : "mt-0.5 font-semibold tabular-nums"}>{money(doc.balance_due)}</dd>
            </div>
          </dl>
        ) : null}
      </div>
      <Card className="mt-6 print:mt-0 print:border-0 print:shadow-none">
        <CardContent className="p-5 sm:p-8 print:p-0">
          <PrintableDocument
            onScreen
            t={t}
            locale={locale}
            heading={heading}
            number={doc.number ?? ""}
            dates={
              kind === "invoice"
                ? [
                    { label: t.invoicing.issueDate, value: doc.issue_date },
                    { label: t.invoices.dueDate, value: doc.end_date },
                  ]
                : [
                    { label: t.invoicing.issueDate, value: doc.issue_date },
                    { label: t.portal.validUntil, value: doc.end_date },
                  ]
            }
            supplier={doc.supplier}
            customer={doc.customer}
            lines={doc.lines}
            totals={doc}
            currency={doc.currency}
            notes={doc.notes}
            terms={doc.terms}
          />
        </CardContent>
      </Card>
    </PortalShell>
  );
}

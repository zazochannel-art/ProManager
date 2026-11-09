import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/config/site";
import { formatMoney, formatNumber } from "@/lib/currency/format";
import { formatDate } from "@/lib/utils/dates";
import type { DocumentLine, PrintParty } from "../services/invoicing-service";
import type { DocumentTotalsRow } from "./document-lines";

/**
 * Paper layout of an estimate or invoice. By default it is print-only (hidden
 * on screen); `onScreen` also shows it on screen, as the client portal does.
 * The browser's print dialog turns it into paper or a PDF; nothing is
 * generated server-side.
 */
export function PrintableDocument({
  t,
  locale,
  heading,
  number,
  dates,
  supplier,
  customer,
  lines,
  totals,
  currency,
  notes,
  terms,
  footer,
  onScreen = false,
}: {
  t: Dictionary;
  locale: Locale;
  heading: string;
  number: string;
  dates: { label: string; value: string | null }[];
  supplier: PrintParty;
  customer: PrintParty | null;
  lines: DocumentLine[];
  totals: DocumentTotalsRow;
  currency: string;
  notes: string | null;
  terms: string | null;
  footer?: string;
  onScreen?: boolean;
}) {
  const money = (v: string) => formatMoney(v, currency, locale);
  const hasDiscount = lines.some((l) => Number(l.discount_percent) > 0);
  return (
    <article
      className={
        onScreen
          ? "text-sm leading-snug text-black print:text-[11pt]"
          : "hidden text-[11pt] leading-snug text-black print:block"
      }
      aria-hidden={onScreen ? undefined : true}
    >
      <header
        className={
          onScreen
            ? "flex flex-col gap-3 border-b border-black/20 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8 print:flex-row"
            : "flex items-start justify-between gap-8 border-b border-black/20 pb-4"
        }
      >
        <div>
          <p className="text-2xl font-semibold">{heading}</p>
          <p className="mt-1 font-mono text-base">{number}</p>
        </div>
        <dl
          className={
            onScreen
              ? "text-sm sm:text-right print:text-right"
              : "text-right text-sm"
          }
        >
          {dates
            .filter((d) => d.value)
            .map((d) => (
              <div key={d.label}>
                <dt className="inline text-black/60">{d.label}: </dt>
                <dd className="inline">{formatDate(d.value, locale)}</dd>
              </div>
            ))}
        </dl>
      </header>
      <section
        className={
          onScreen
            ? "mt-5 grid gap-5 text-sm sm:grid-cols-2 sm:gap-8 print:grid-cols-2"
            : "mt-5 grid grid-cols-2 gap-8 text-sm"
        }
      >
        <Party title={t.invoicing.supplier} party={supplier} t={t} />
        {customer ? (
          <Party title={t.invoicing.billTo} party={customer} t={t} />
        ) : (
          <div />
        )}
      </section>
      <div
        className={
          onScreen ? "mt-6 overflow-x-auto print:overflow-visible" : "mt-6"
        }
      >
        <table
          className={
            onScreen
              ? "w-full min-w-[34rem] border-collapse text-sm print:min-w-0"
              : "w-full border-collapse text-sm"
          }
        >
          <thead>
            <tr className="border-b border-black/40 text-left">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">{t.invoicing.lines.item}</th>
              <th className="py-1.5 pr-2 text-right">
                {t.invoicing.lines.quantity}
              </th>
              <th className="py-1.5 pr-2">{t.invoicing.lines.unit}</th>
              <th className="py-1.5 pr-2 text-right">
                {t.invoicing.lines.unitPrice}
              </th>
              {hasDiscount ? (
                <th className="py-1.5 pr-2 text-right">
                  {t.invoicing.lines.discountPercent}
                </th>
              ) : null}
              <th className="py-1.5 pr-2 text-right">
                {t.invoicing.lines.taxRate}
              </th>
              <th className="py-1.5 text-right">
                {t.invoicing.lines.lineTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="border-b border-black/10 align-top">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2 whitespace-pre-line">
                  {l.description}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatNumber(
                    l.quantity,
                    locale,
                    l.quantity.includes(".")
                      ? l.quantity.split(".")[1]!.length
                      : 0,
                  )}
                </td>
                <td className="py-1.5 pr-2">{l.unit}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {money(l.unit_price)}
                </td>
                {hasDiscount ? (
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {Number(l.discount_percent) > 0
                      ? `${l.discount_percent}%`
                      : ""}
                  </td>
                ) : null}
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {l.tax_rate}%
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {money(l.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 ml-auto w-full max-w-72 text-sm">
        <Row label={t.invoicing.subtotal} value={money(totals.subtotal)} />
        {Number(totals.discount_total) > 0 ? (
          <Row
            label={t.invoicing.discount}
            value={`−${money(totals.discount_total)}`}
          />
        ) : null}
        <Row label={t.invoicing.tax} value={money(totals.tax_total)} />
        <div className="mt-1 flex justify-between border-t border-black/40 pt-1.5 text-base font-semibold">
          <dt>{t.invoicing.totalDue}</dt>
          <dd className="tabular-nums">{money(totals.total)}</dd>
        </div>
      </dl>
      {notes ? <TextBlock title={t.invoicing.notes} body={notes} /> : null}
      {terms ? <TextBlock title={t.invoicing.terms} body={terms} /> : null}
      {footer ? <p className="mt-8 text-xs text-black/60">{footer}</p> : null}
    </article>
  );
}

function Party({
  title,
  party,
  t,
}: {
  title: string;
  party: PrintParty;
  t: Dictionary;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-black/60 uppercase">
        {title}
      </p>
      <p className="mt-1 font-semibold">{party.name}</p>
      {party.taxId ? (
        <p>
          {t.invoicing.taxId}: {party.taxId}
        </p>
      ) : null}
      {party.registrationNumber ? (
        <p>
          {t.invoicing.regNumber}: {party.registrationNumber}
        </p>
      ) : null}
      {party.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <dt className="text-black/60">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function TextBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-5 text-sm">
      <p className="text-xs font-semibold tracking-wide text-black/60 uppercase">
        {title}
      </p>
      <p className="mt-1 whitespace-pre-line">{body}</p>
    </section>
  );
}

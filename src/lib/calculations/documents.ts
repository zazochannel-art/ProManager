import { add, dec, mul, round, sub, sum, toFixed, div, type DecimalInput } from "./decimal";

/**
 * Line-item and document totals for estimates and invoices.
 *
 * The database is authoritative (GENERATED columns + totals trigger in
 * supabase/migrations/*_finance.sql). This module implements the SAME
 * formulas for live form previews and server-side validation; an integration
 * test asserts both produce identical results.
 *
 *   line_subtotal = round(quantity × unit_price, 2)
 *   line_discount = round(line_subtotal × discount% / 100, 2)
 *   line_tax      = round((line_subtotal − line_discount) × tax_rate / 100, 2)
 *   line_total    = line_subtotal − line_discount + line_tax
 *   subtotal = Σ line_subtotal;  total = subtotal − discounts + taxes
 */
export interface LineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  discountPercent?: DecimalInput;
  taxRate?: DecimalInput;
}

export interface LineTotals {
  lineSubtotal: string;
  lineDiscount: string;
  lineTax: string;
  lineTotal: string;
}

export interface DocumentTotals {
  lines: LineTotals[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
}

const HUNDRED = dec(100);

export function calculateLine(line: LineInput): LineTotals {
  const quantity = dec(line.quantity);
  const unitPrice = dec(line.unitPrice);
  const discountPercent = dec(line.discountPercent ?? 0);
  const taxRate = dec(line.taxRate ?? 0);

  if (quantity <= 0n) throw new RangeError("quantity must be greater than zero");
  if (unitPrice < 0n) throw new RangeError("unit price cannot be negative");
  if (discountPercent < 0n || discountPercent > HUNDRED) throw new RangeError("discount must be between 0 and 100");
  if (taxRate < 0n || taxRate > HUNDRED) throw new RangeError("tax rate must be between 0 and 100");

  const lineSubtotal = round(mul(quantity, unitPrice), 2);
  const lineDiscount = round(div(mul(lineSubtotal, discountPercent), HUNDRED), 2);
  const taxable = sub(lineSubtotal, lineDiscount);
  const lineTax = round(div(mul(taxable, taxRate), HUNDRED), 2);
  const lineTotal = add(taxable, lineTax);

  return {
    lineSubtotal: toFixed(lineSubtotal),
    lineDiscount: toFixed(lineDiscount),
    lineTax: toFixed(lineTax),
    lineTotal: toFixed(lineTotal),
  };
}

export function calculateDocumentTotals(lines: readonly LineInput[]): DocumentTotals {
  const computed = lines.map(calculateLine);
  const subtotal = sum(computed.map((l) => l.lineSubtotal));
  const discountTotal = sum(computed.map((l) => l.lineDiscount));
  const taxTotal = sum(computed.map((l) => l.lineTax));
  const total = add(sub(subtotal, discountTotal), taxTotal);
  return {
    lines: computed,
    subtotal: toFixed(subtotal),
    discountTotal: toFixed(discountTotal),
    taxTotal: toFixed(taxTotal),
    total: toFixed(total),
  };
}

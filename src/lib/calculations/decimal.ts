/**
 * Exact decimal arithmetic for money, based on BigInt fixed-point values.
 *
 * Floating point is never used for financial values. All values are held as
 * integers scaled by 10^10, which represents every quantity (3 dp), price
 * (2 dp), percentage (2 dp) and tax rate (4 dp) the platform stores — and all
 * of their products — exactly. Rounding is "half away from zero", identical
 * to PostgreSQL's round(numeric, n), so results match the database.
 */
export const SCALE_DIGITS = 10;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

/** Opaque fixed-point decimal. */
export type Decimal = bigint & { readonly __decimal: unique symbol };
export type DecimalInput = Decimal | string | number;

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

function asDecimal(value: bigint): Decimal {
  return value as Decimal;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
  const s = String(value);
  if (!/e/i.test(s)) return s;
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

export function isDecimalString(value: string): boolean {
  return DECIMAL_RE.test(value.trim());
}

/** Parses "1234.56", "-0.5", 12.3 or an existing Decimal. Throws on invalid input. */
export function dec(value: DecimalInput): Decimal {
  if (typeof value === "bigint") return value;
  const text = (typeof value === "number" ? numberToPlainString(value) : value).trim().replace(",", ".");
  const match = DECIMAL_RE.exec(text);
  if (!match) throw new RangeError(`Invalid decimal value: "${String(value)}"`);
  const [, sign, intPart, fracRaw = ""] = match;
  if (fracRaw.length > SCALE_DIGITS) {
    // More precision than we carry: round half away from zero at SCALE_DIGITS.
    const truncated = dec(`${sign ?? ""}${intPart}.${fracRaw.slice(0, SCALE_DIGITS)}`);
    const nextDigit = Number(fracRaw[SCALE_DIGITS]);
    if (nextDigit >= 5) return asDecimal(truncated + (sign === "-" ? -1n : 1n));
    return truncated;
  }
  const frac = fracRaw.padEnd(SCALE_DIGITS, "0");
  const magnitude = BigInt(intPart ?? "0") * SCALE + BigInt(frac);
  return asDecimal(sign === "-" ? -magnitude : magnitude);
}

export const ZERO = dec(0);

export function add(a: DecimalInput, b: DecimalInput): Decimal {
  return asDecimal(dec(a) + dec(b));
}

export function sub(a: DecimalInput, b: DecimalInput): Decimal {
  return asDecimal(dec(a) - dec(b));
}

export function neg(a: DecimalInput): Decimal {
  return asDecimal(-dec(a));
}

function divRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let q = n / d;
  const r = n % d;
  if (r * 2n >= d) q += 1n;
  return negative ? -q : q;
}

export function mul(a: DecimalInput, b: DecimalInput): Decimal {
  return asDecimal(divRoundHalfAwayFromZero(dec(a) * dec(b), SCALE));
}

export function div(a: DecimalInput, b: DecimalInput): Decimal {
  return asDecimal(divRoundHalfAwayFromZero(dec(a) * SCALE, dec(b)));
}

/** Rounds to `digits` decimal places, half away from zero (= PostgreSQL round()). */
export function round(a: DecimalInput, digits = 2): Decimal {
  if (digits < 0 || digits > SCALE_DIGITS) throw new RangeError("digits out of range");
  const factor = 10n ** BigInt(SCALE_DIGITS - digits);
  return asDecimal(divRoundHalfAwayFromZero(dec(a), factor) * factor);
}

export function sum(values: Iterable<DecimalInput>): Decimal {
  let total = 0n;
  for (const v of values) total += dec(v);
  return asDecimal(total);
}

export function compare(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  const x = dec(a);
  const y = dec(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const eq = (a: DecimalInput, b: DecimalInput) => compare(a, b) === 0;
export const gt = (a: DecimalInput, b: DecimalInput) => compare(a, b) === 1;
export const gte = (a: DecimalInput, b: DecimalInput) => compare(a, b) >= 0;
export const lt = (a: DecimalInput, b: DecimalInput) => compare(a, b) === -1;
export const lte = (a: DecimalInput, b: DecimalInput) => compare(a, b) <= 0;
export const isZero = (a: DecimalInput) => dec(a) === 0n;
export const isNegative = (a: DecimalInput) => dec(a) < 0n;

export function max(a: DecimalInput, b: DecimalInput): Decimal {
  return gte(a, b) ? dec(a) : dec(b);
}

/** Fixed-point string with exactly `digits` decimals (rounded half away from zero). */
export function toFixed(a: DecimalInput, digits = 2): string {
  const rounded = round(a, digits);
  const negative = rounded < 0n;
  const abs = negative ? -rounded : rounded;
  const intPart = abs / SCALE;
  const fracPart = (abs % SCALE).toString().padStart(SCALE_DIGITS, "0").slice(0, digits);
  const body = digits > 0 ? `${intPart}.${fracPart}` : `${intPart}`;
  return negative && rounded !== 0n ? `-${body}` : body;
}

/** For display formatting only (Intl). Never feed the result back into calculations. */
export function toNumberForDisplay(a: DecimalInput): number {
  return Number(toFixed(a, 4));
}

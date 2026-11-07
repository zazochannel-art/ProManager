import { describe, expect, it } from "vitest";
import { add, compare, dec, div, isDecimalString, mul, round, sub, sum, toFixed } from "@/lib/calculations/decimal";

describe("decimal arithmetic", () => {
  it("avoids binary floating point errors", () => {
    expect(toFixed(add("0.1", "0.2"))).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3); // the problem this module exists to avoid
    expect(toFixed(mul("1.15", "100"))).toBe("115.00");
  });

  it("rounds half away from zero like PostgreSQL round()", () => {
    expect(toFixed(round("2.345", 2))).toBe("2.35");
    expect(toFixed(round("2.344", 2))).toBe("2.34");
    expect(toFixed(round("-2.345", 2))).toBe("-2.35");
    expect(toFixed(round("0.005", 2))).toBe("0.01");
  });

  it("divides with enough precision", () => {
    expect(toFixed(div("10", "3"), 4)).toBe("3.3333");
    expect(() => div("1", "0")).toThrow();
  });

  it("sums, subtracts and compares", () => {
    expect(toFixed(sum(["10.10", "20.20", "30.30"]))).toBe("60.60");
    expect(toFixed(sub("5", "7.5"))).toBe("-2.50");
    expect(compare("1.10", "1.1")).toBe(0);
    expect(compare("1.11", "1.1")).toBe(1);
  });

  it("parses only valid decimal strings", () => {
    expect(isDecimalString("12.34")).toBe(true);
    expect(isDecimalString("-0.5")).toBe(true);
    expect(isDecimalString("1e5")).toBe(false);
    expect(isDecimalString("abc")).toBe(false);
    expect(() => dec("not a number")).toThrow();
    expect(() => dec(Number.NaN)).toThrow();
  });
});

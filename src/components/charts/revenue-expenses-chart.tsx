"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INTL_LOCALE, type Locale } from "@/config/site";
import { formatMoney } from "@/lib/currency/format";

export interface MonthlyPoint {
  label: string;
  revenue: number;
  expenses: number;
}

/**
 * Display-only chart. Values arrive already aggregated by the database; the
 * numbers here are used for drawing only, never for further calculation.
 */
export function RevenueExpensesChart({
  data,
  labels,
  currency,
  locale,
}: {
  data: MonthlyPoint[];
  labels: { revenue: string; expenses: string; chart: string };
  currency: string;
  locale: Locale;
}) {
  const compact = new Intl.NumberFormat(INTL_LOCALE[locale], { notation: "compact", maximumFractionDigits: 1 });
  return (
    <div className="h-72 w-full" role="img" aria-label={labels.chart}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6B7280", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "#6B7280", fontSize: 12 }} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip
            cursor={{ fill: "#F3F4F6" }}
            formatter={(value) => formatMoney(String(value), currency, locale)}
            contentStyle={{ borderRadius: 10, border: "1px solid #E5E7EB", boxShadow: "0 8px 24px -6px rgb(17 24 39 / 0.12)" }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name={labels.revenue} fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name={labels.expenses} fill="#CBD5E1" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

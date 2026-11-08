import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sub, toFixed } from "@/lib/calculations/decimal";
import { asUser, createTestDatabase, databaseAvailable, dropTestDatabase, type Db } from "./db";

const available = await databaseAvailable();
const OWNER = "00000000-0000-4000-a000-000000000001";
const OTHER = "00000000-0000-4000-a000-000000000003";

describe.skipIf(!available)("seed data and dashboard aggregates", () => {
  let db: Db;
  let org: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    await db.pool.query(readFileSync(join(import.meta.dirname, "..", "..", "supabase", "seed.sql"), "utf8"));
    org = (await db.pool.query("select id from organizations where slug = 'atelier-demo'")).rows[0].id;
  });
  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("applies cleanly and is idempotent", async () => {
    await db.pool.query(readFileSync(join(import.meta.dirname, "..", "..", "supabase", "seed.sql"), "utf8"));
    const { rows } = await db.pool.query("select count(*)::int as n from organizations");
    expect(rows[0].n).toBe(2);
  });

  it("dashboard figures are real aggregates of the stored documents", async () => {
    const summary = (await asUser(db, OWNER, (s) => s.query("select public.dashboard_summary($1, 6) as d", [org]))).rows[0].d;
    const expected = (
      await db.pool.query(
        `select
           (select coalesce(sum(balance_due), 0) from invoices where organization_id = $1 and status in ('issued','partially_paid'))::text as pending,
           (select count(*) from invoices where organization_id = $1 and status in ('issued','partially_paid') and due_date < current_date)::int as overdue_count`,
        [org],
      )
    ).rows[0];
    expect(toFixed(summary.pending_invoices.amount)).toBe(toFixed(expected.pending));
    expect(summary.overdue_invoices.count).toBe(expected.overdue_count);
    expect(summary.monthly).toHaveLength(6);
    const last = summary.monthly[5];
    expect(toFixed(last.revenue)).toBe(toFixed(summary.revenue_month));
    expect(toFixed(last.expenses)).toBe(toFixed(summary.expenses_month));
    expect(summary.active_projects).toBe(1);
    expect(toFixed(sub(summary.revenue_month, summary.expenses_month))).toMatch(/^-?\d+\.\d{2}$/);
  });

  it("the second demo tenant sees none of the first tenant's data", async () => {
    await asUser(db, OTHER, async (s) => {
      expect((await s.query("select 1 from invoices")).rowCount).toBe(0);
      const customers = await s.query("select name from customers");
      expect(customers.rows).toEqual([{ name: "Private Customer of Org B" }]);
    });
  });
});

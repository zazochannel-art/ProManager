import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();
if (!available) console.warn("[integration] PostgreSQL not reachable (TEST_DATABASE_URL) — RLS tests SKIPPED, not passed.");

describe.skipIf(!available)("RLS tenant isolation (Organization A vs Organization B)", () => {
  let db: Db;
  let userA: string;
  let userB: string;
  let orgA: string;
  let orgB: string;
  let customerA: string;
  let projectA: string;
  let invoiceA: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    userA = await createUser(db, "alice@a.test");
    userB = await createUser(db, "bob@b.test");
    orgA = await createOrganization(db, userA, "Org A", "org-a");
    orgB = await createOrganization(db, userB, "Org B", "org-b");

    await asUser(db, userA, async (s) => {
      customerA = (await s.query("insert into customers (organization_id, name, email) values ($1, 'Secret Customer A', 'c@a.test') returning id", [orgA])).rows[0].id;
      projectA = (await s.query("insert into projects (organization_id, customer_id, name, currency) values ($1, $2, 'Project A', 'MDL') returning id", [orgA, customerA])).rows[0].id;
      invoiceA = (await s.query("insert into invoices (organization_id, customer_id, currency) values ($1, $2, 'MDL') returning id", [orgA, customerA])).rows[0].id;
      await s.query("insert into invoice_items (organization_id, invoice_id, description, quantity, unit_price, tax_rate) values ($1, $2, 'Work', 2, 100, 20)", [orgA, invoiceA]);
      await s.query("select public.issue_invoice($1)", [invoiceA]);
    });
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("A can read its own data", async () => {
    await asUser(db, userA, async (s) => {
      expect((await s.query("select id from customers where id = $1", [customerA])).rowCount).toBe(1);
      expect((await s.query("select id from invoices where id = $1", [invoiceA])).rowCount).toBe(1);
    });
  });

  it("B cannot read any of A's rows", async () => {
    await asUser(db, userB, async (s) => {
      for (const [table, id] of [
        ["organizations", orgA],
        ["customers", customerA],
        ["projects", projectA],
        ["invoices", invoiceA],
      ] as const) {
        expect((await s.query(`select id from ${table} where id = $1`, [id])).rowCount, table).toBe(0);
      }
      expect((await s.query("select 1 from organization_members where organization_id = $1", [orgA])).rowCount).toBe(0);
      expect((await s.query("select 1 from organization_settings where organization_id = $1", [orgA])).rowCount).toBe(0);
      expect((await s.query("select 1 from invoice_items where organization_id = $1", [orgA])).rowCount).toBe(0);
      expect((await s.query("select 1 from activity_logs where organization_id = $1", [orgA])).rowCount).toBe(0);
      expect((await s.query("select 1 from subscriptions where organization_id = $1", [orgA])).rowCount).toBe(0);
      expect((await s.query("select 1 from profiles where id = $1", [userA])).rowCount).toBe(0);
      // Unfiltered queries only ever return B's own rows.
      const all = await s.query("select organization_id from customers");
      expect(all.rows.every((r) => r.organization_id === orgB)).toBe(true);
    });
  });

  it("B cannot modify or delete A's rows", async () => {
    await asUser(db, userB, async (s) => {
      expect((await s.query("update customers set name = 'hacked' where id = $1", [customerA])).rowCount).toBe(0);
      expect((await s.query("delete from customers where id = $1", [customerA])).rowCount).toBe(0);
      expect((await s.query("update projects set name = 'hacked' where id = $1", [projectA])).rowCount).toBe(0);
      expect((await s.query("update organizations set name = 'hacked' where id = $1", [orgA])).rowCount).toBe(0);
    });
    await asUser(db, userA, async (s) => {
      expect((await s.query("select name from customers where id = $1", [customerA])).rows[0].name).toBe("Secret Customer A");
    });
  });

  it("B cannot insert rows into A's organization", async () => {
    await expectPgError(
      asUser(db, userB, (s) => s.query("insert into customers (organization_id, name) values ($1, 'Injected')", [orgA])),
      "42501",
    );
    await expectPgError(
      asUser(db, userB, (s) => s.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [orgA, userB])),
      "42501",
    );
  });

  it("B cannot link its rows to A's records (composite foreign keys)", async () => {
    await expectPgError(
      asUser(db, userB, (s) => s.query("insert into projects (organization_id, customer_id, name, currency) values ($1, $2, 'Steal', 'MDL')", [orgB, customerA])),
      "23503",
    );
  });

  it("rows cannot be moved to another organization", async () => {
    await expectPgError(asUser(db, userA, (s) => s.query("update customers set organization_id = $1 where id = $2", [orgB, customerA])), "42501");
  });

  it("B cannot run A's workflows or reports", async () => {
    await expectPgError(asUser(db, userB, (s) => s.query("select public.issue_invoice($1)", [invoiceA])), "42501");
    await expectPgError(
      asUser(db, userB, (s) =>
        s.query("select public.record_payment($1, $2, 10, 'MDL', 'cash', current_date, 'cross-tenant-1', '[]'::jsonb)", [orgA, customerA]),
      ),
      "42501",
    );
    await expectPgError(asUser(db, userB, (s) => s.query("select public.dashboard_summary($1, 6)", [orgA])), "42501");
    const search = await asUser(db, userB, (s) => s.query("select * from public.search_organization($1, 'Secret', 10)", [orgA]));
    expect(search.rowCount).toBe(0);
  });

  it("B cannot read or write A's storage objects", async () => {
    await db.pool.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${orgA}/contract.pdf`]);
    await asUser(db, userB, async (s) => {
      expect((await s.query("select 1 from storage.objects where name like $1", [`${orgA}/%`])).rowCount).toBe(0);
    });
    await expectPgError(
      asUser(db, userB, (s) => s.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${orgA}/evil.pdf`])),
      "42501",
    );
    await asUser(db, userA, async (s) => {
      expect((await s.query("select 1 from storage.objects where name = $1", [`${orgA}/contract.pdf`])).rowCount).toBe(1);
    });
  });

  it("anonymous requests see nothing", async () => {
    await asUser(db, null, async (s) => {
      expect((await s.query("select 1 from customers")).rowCount).toBe(0);
      expect((await s.query("select 1 from organizations")).rowCount).toBe(0);
      expect((await s.query("select 1 from invoices")).rowCount).toBe(0);
    });
    await expectPgError(asUser(db, null, (s) => s.query("select public.create_organization('X', 'xxx-anon', 'MD', 'MDL', 'ro', 'UTC')")), "42501");
  });

  it("every public table has RLS enabled", async () => {
    const { rows } = await db.pool.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(rows).toEqual([]);
  });
});

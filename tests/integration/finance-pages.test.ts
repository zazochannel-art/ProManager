import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/**
 * Phase 4b: the database rules behind Settings → VAT rates, the payments page
 * and the expenses page, run with the statements the Server Actions send.
 */
describe.skipIf(!available)("VAT rates, payments and expenses", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let accountant: string;
  let viewer: string;
  let employee: string;
  let org: string;
  let customer: string;
  let project: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@fin.test");
    manager = await createUser(db, "manager@fin.test");
    accountant = await createUser(db, "acc@fin.test");
    viewer = await createUser(db, "viewer@fin.test");
    employee = await createUser(db, "employee@fin.test");
    org = await createOrganization(db, owner, "Finance Pages Co", "finance-pages-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [accountant, "accountant"],
      [viewer, "viewer"],
      [employee, "employee"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
    customer = (await asUser(db, owner, (s) => s.query("insert into customers (organization_id, name) values ($1, 'Client SRL') returning id", [org]))).rows[0].id;
    project = (await asUser(db, owner, (s) => s.query("insert into projects (organization_id, name, customer_id, currency) values ($1, 'Renovare', $2, 'MDL') returning id", [org, customer]))).rows[0].id;
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  describe("VAT rates", () => {
    const insertRate = (user: string, name: string, rate: string, isDefault = false) =>
      asUser(db, user, (s) => s.query("insert into tax_rates (organization_id, name, rate, valid_from, is_default) values ($1, $2, $3, '2020-01-01', $4) returning id", [org, name, rate, isDefault]));

    it("lets only owners and admins manage rates, while every member reads them", async () => {
      await expectPgError(insertRate(manager, "TVA", "20"), "42501");
      await expectPgError(insertRate(accountant, "TVA", "20"), "42501");
      const id = (await insertRate(owner, "TVA standard", "20", true)).rows[0].id as string;
      const seen = await asUser(db, employee, (s) => s.query("select name, rate from tax_rates where organization_id = $1", [org]));
      expect(seen.rows).toEqual([{ name: "TVA standard", rate: "20.0000" }]);
      // An accountant cannot even rename it (RLS hides the row from the update).
      const renamed = await asUser(db, accountant, (s) => s.query("update tax_rates set name = 'x' where id = $1", [id]));
      expect(renamed.rowCount).toBe(0);
    });

    it("moves the default flag the way the settings action does", async () => {
      const reduced = (await insertRate(owner, "TVA redus", "8")).rows[0].id as string;
      await asUser(db, owner, async (s) => {
        await s.query("update tax_rates set is_default = false where organization_id = $1 and is_default and id <> $2", [org, reduced]);
        await s.query("update tax_rates set is_default = true, is_active = true where id = $1", [reduced]);
      });
      const { rows } = await asUser(db, manager, (s) => s.query("select name, is_default from applicable_tax_rates($1, current_date)", [org]));
      expect(rows).toEqual([
        { name: "TVA redus", is_default: true },
        { name: "TVA standard", is_default: false },
      ]);
      // A deactivated rate is no longer offered on line forms.
      await asUser(db, owner, (s) => s.query("update tax_rates set is_active = false, is_default = false where id = $1", [reduced]));
      const after = await asUser(db, manager, (s) => s.query("select name from applicable_tax_rates($1, current_date)", [org]));
      expect(after.rows).toEqual([{ name: "TVA standard" }]);
    });

    it("refuses deleting a rate linked to a document line, and rejects rates above 100 %", async () => {
      const rate = (await insertRate(owner, "TVA zero", "0")).rows[0].id as string;
      const est = (await asUser(db, manager, (s) => s.query("insert into estimates (organization_id, customer_id, currency, created_by) values ($1, $2, 'MDL', $3) returning id", [org, customer, manager]))).rows[0].id;
      await asUser(db, manager, (s) =>
        s.query("insert into estimate_items (organization_id, estimate_id, position, description, unit, quantity, unit_price, tax_rate_id, tax_rate) values ($1, $2, 0, 'Export', 'buc', 1, 10, $3, 0)", [org, est, rate]),
      );
      await expectPgError(asUser(db, owner, (s) => s.query("delete from tax_rates where id = $1", [rate])), "23503");
      await expectPgError(insertRate(owner, "Greșit", "120"), "23514");
    });
  });

  describe("payments list", () => {
    it("shows every payment with its invoices to finance readers only, and voids from the list", async () => {
      const invoice = (
        await asUser(db, accountant, (s) => s.query("insert into invoices (organization_id, customer_id, currency, created_by) values ($1, $2, 'MDL', $3) returning id", [org, customer, accountant]))
      ).rows[0].id as string;
      await asUser(db, accountant, (s) =>
        s.query("insert into invoice_items (organization_id, invoice_id, position, description, unit, quantity, unit_price, tax_rate) values ($1, $2, 0, 'Lucrare', 'buc', 1, 500, 0)", [org, invoice]),
      );
      const number = (await asUser(db, accountant, (s) => s.query("select number from issue_invoice($1)", [invoice]))).rows[0].number as string;
      const paymentId = (
        await asUser(db, accountant, (s) =>
          s.query("select record_payment($1, $2, 200, 'MDL', 'cash', current_date, 'pages-key-0001', $3::jsonb) as id", [org, customer, JSON.stringify([{ invoice_id: invoice, amount: "200" }])]),
        )
      ).rows[0].id as string;

      // The same nested select the payments page sends.
      const list = (user: string) =>
        asUser(db, user, (s) =>
          s.query(
            `select p.number, p.amount, p.voided_at is not null as voided,
                    (select json_agg(json_build_object('invoice_id', a.invoice_id, 'number', i.number)) from payment_allocations a join invoices i on i.id = a.invoice_id where a.payment_id = p.id) as invoices
             from payments p where p.organization_id = $1 order by p.paid_on desc`,
            [org],
          ),
        );
      const seen = (await list(viewer)).rows;
      expect(seen).toEqual([{ number: expect.stringMatching(/^PAY-\d{4}-0001$/), amount: "200.00", voided: false, invoices: [{ invoice_id: invoice, number }] }]);
      expect((await list(employee)).rows).toEqual([]);

      await expectPgError(asUser(db, manager, (s) => s.query("select void_payment($1, 'greșeală')", [paymentId])), "42501");
      await asUser(db, accountant, (s) => s.query("select void_payment($1, 'retur bancar')", [paymentId]));
      const after = (await list(viewer)).rows[0];
      expect(after.voided).toBe(true);
      const balance = (await db.pool.query("select status, balance_due from invoices where id = $1", [invoice])).rows[0];
      expect(balance).toEqual({ status: "issued", balance_due: "500.00" });
    });
  });

  describe("expenses", () => {
    const insertExpense = (user: string, patch: { category?: string | null; status?: "paid" | "unpaid"; amount?: string } = {}) =>
      asUser(db, user, (s) =>
        s.query(
          `insert into expenses (organization_id, category_id, kind, project_id, description, amount, tax_amount, currency, expense_date, payment_status, paid_on, created_by)
           values ($1, $2, 'material', $3, 'Adeziv', $4, 20, 'MDL', current_date, $5::expense_payment_status, case when $5::text = 'paid' then current_date end, $6) returning id, total`,
          [org, patch.category ?? null, project, patch.amount ?? "100", patch.status ?? "unpaid", user],
        ),
      );

    it("lets managers and accountants record expenses but not employees or viewers", async () => {
      const row = (await insertExpense(manager)).rows[0];
      expect(row.total).toBe("120.00");
      await insertExpense(accountant, { status: "paid" });
      await expectPgError(insertExpense(employee), "42501");
      await expectPgError(insertExpense(viewer), "42501");
      expect((await asUser(db, employee, (s) => s.query("select id from expenses where organization_id = $1", [org]))).rowCount).toBe(0);
    });

    it("marks an expense as paid and counts it in the project financials", async () => {
      const id = (await insertExpense(manager, { amount: "50" })).rows[0].id as string;
      await asUser(db, manager, (s) => s.query("update expenses set payment_status = 'paid', paid_on = current_date where id = $1", [id]));
      expect((await db.pool.query("select payment_status from expenses where id = $1", [id])).rows[0].payment_status).toBe("paid");
      const fin = (await asUser(db, viewer, (s) => s.query("select project_financials($1, $2) as f", [org, project]))).rows[0].f;
      expect(Number(fin.material_costs)).toBeGreaterThan(0);
    });

    it("leaves deleting to owners and admins", async () => {
      const id = (await insertExpense(accountant)).rows[0].id as string;
      expect((await asUser(db, manager, (s) => s.query("delete from expenses where id = $1 returning id", [id]))).rowCount).toBe(0);
      expect((await asUser(db, accountant, (s) => s.query("delete from expenses where id = $1 returning id", [id]))).rowCount).toBe(0);
      expect((await asUser(db, owner, (s) => s.query("delete from expenses where id = $1 returning id", [id]))).rowCount).toBe(1);
    });

    it("keeps category names unique and protects categories that have expenses", async () => {
      const add = (user: string, name: string) => asUser(db, user, (s) => s.query("insert into expense_categories (organization_id, name, kind) values ($1, $2, 'material') returning id", [org, name]));
      const category = (await add(manager, "Gresie")).rows[0].id as string;
      await expectPgError(add(accountant, "Gresie"), "23505");
      await expectPgError(add(employee, "Faianță"), "42501");
      await insertExpense(manager, { category });
      await expectPgError(asUser(db, owner, (s) => s.query("delete from expense_categories where id = $1", [category])), "23503");
      // Hiding it is an ordinary write.
      expect((await asUser(db, manager, (s) => s.query("update expense_categories set is_active = false where id = $1", [category]))).rowCount).toBe(1);
      const empty = (await add(manager, "Diverse")).rows[0].id as string;
      expect((await asUser(db, manager, (s) => s.query("delete from expense_categories where id = $1 returning id", [empty]))).rowCount).toBe(0);
      expect((await asUser(db, owner, (s) => s.query("delete from expense_categories where id = $1 returning id", [empty]))).rowCount).toBe(1);
    });
  });
});

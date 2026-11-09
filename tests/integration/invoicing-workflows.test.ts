import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/**
 * Phase 4: the database rules behind the estimate and invoice screens, run
 * with the same statements the Server Actions send (as the API role).
 */
describe.skipIf(!available)("estimate and invoice workflows", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let accountant: string;
  let viewer: string;
  let org: string;
  let customer: string;

  const year = new Date().getUTCFullYear();

  async function newEstimate(user: string) {
    return asUser(db, user, async (s) => {
      const { rows } = await s.query("insert into estimates (organization_id, customer_id, currency, title, created_by) values ($1, $2, 'MDL', 'Renovare', $3) returning id, number, valid_until, issue_date", [
        org,
        customer,
        user,
      ]);
      return rows[0] as { id: string; number: string; valid_until: string; issue_date: string };
    });
  }

  async function addLine(user: string, table: "estimate_items" | "invoice_items", docColumn: "estimate_id" | "invoice_id", docId: string, position: number, quantity: string, price: string, tax = "20") {
    return asUser(db, user, (s) =>
      s.query(`insert into ${table} (organization_id, ${docColumn}, position, description, unit, quantity, unit_price, discount_percent, tax_rate) values ($1, $2, $3, 'Lucrare', 'buc', $4, $5, '0', $6) returning id`, [
        org,
        docId,
        position,
        quantity,
        price,
        tax,
      ]),
    );
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@inv.test");
    manager = await createUser(db, "manager@inv.test");
    accountant = await createUser(db, "acc@inv.test");
    viewer = await createUser(db, "viewer@inv.test");
    org = await createOrganization(db, owner, "Invoicing Co", "invoicing-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [accountant, "accountant"],
      [viewer, "viewer"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
    customer = (await asUser(db, owner, (s) => s.query("insert into customers (organization_id, name) values ($1, 'Client SRL') returning id", [org]))).rows[0].id;
    await asUser(db, owner, (s) => s.query("insert into tax_rates (organization_id, name, rate, valid_from, is_default) values ($1, 'TVA standard', 20, '2020-01-01', true)", [org]));
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("numbers a new estimate and fills the validity from the settings", async () => {
    const est = await newEstimate(manager);
    expect(est.number).toBe(`EST-${year}-0001`);
    const { rows } = await db.pool.query("select estimate_valid_days from organization_settings where organization_id = $1", [org]);
    const days = Math.round((Date.parse(est.valid_until) - Date.parse(est.issue_date)) / 86_400_000);
    expect(days).toBe(rows[0].estimate_valid_days);
  });

  it("does not let a viewer create estimates", async () => {
    await expectPgError(newEstimate(viewer), "42501");
  });

  it("lists the default tax rate for line forms", async () => {
    const { rows } = await asUser(db, manager, (s) => s.query("select name, rate, is_default from applicable_tax_rates($1, current_date)", [org]));
    expect(rows).toEqual([{ name: "TVA standard", rate: "20.0000", is_default: true }]);
  });

  it("walks an estimate from draft to an issued, paid invoice", async () => {
    const est = await newEstimate(manager);
    await addLine(manager, "estimate_items", "estimate_id", est.id, 0, "2.5", "100.00");
    await addLine(manager, "estimate_items", "estimate_id", est.id, 1, "1", "49.99", "0");
    const totals = (await db.pool.query("select subtotal, tax_total, total from estimates where id = $1", [est.id])).rows[0];
    expect(totals).toEqual({ subtotal: "299.99", tax_total: "50.00", total: "349.99" });

    // Mark as sent: the guard trigger stamps sent_at.
    await asUser(db, manager, (s) => s.query("update estimates set status = 'sent' where id = $1", [est.id]));
    expect((await db.pool.query("select sent_at from estimates where id = $1", [est.id])).rows[0].sent_at).not.toBeNull();

    // A manager may write estimates but not invoices, so cannot convert.
    await expectPgError(asUser(db, manager, (s) => s.query("select convert_estimate_to_invoice($1)", [est.id])), "42501");

    const invoiceId = (await asUser(db, accountant, (s) => s.query("select convert_estimate_to_invoice($1) as id", [est.id]))).rows[0].id as string;
    const estimate = (await db.pool.query("select status, converted_invoice_id from estimates where id = $1", [est.id])).rows[0];
    expect(estimate).toEqual({ status: "converted", converted_invoice_id: invoiceId });
    const draft = (await db.pool.query("select status, number, estimate_id, total from invoices where id = $1", [invoiceId])).rows[0];
    expect(draft).toEqual({ status: "draft", number: null, estimate_id: est.id, total: "349.99" });

    // The converted estimate is locked, lines included.
    await expectPgError(asUser(db, owner, (s) => s.query("update estimates set title = 'x' where id = $1", [est.id])), "42501");
    await expectPgError(addLine(owner, "estimate_items", "estimate_id", est.id, 2, "1", "1"), "42501");
    // The estimate references the draft, so the draft cannot be deleted (the UI hides the button).
    await expectPgError(asUser(db, owner, (s) => s.query("delete from invoices where id = $1", [invoiceId])), "23503");

    const issued = (await asUser(db, accountant, (s) => s.query("select number, status, due_date is not null as has_due from issue_invoice($1)", [invoiceId]))).rows[0];
    expect(issued).toEqual({ number: `INV-${year}-0001`, status: "issued", has_due: true });
    await expectPgError(addLine(accountant, "invoice_items", "invoice_id", invoiceId, 5, "1", "1"), "42501");

    const key = "test-key-0001";
    const pay = (amount: string) =>
      asUser(db, accountant, (s) =>
        s.query("select record_payment($1, $2, $3, 'MDL', 'bank_transfer', current_date, $4, $5::jsonb) as id", [
          org,
          customer,
          amount,
          `${key}-${amount}`,
          JSON.stringify([{ invoice_id: invoiceId, amount }]),
        ]),
      );
    const first = (await pay("100.00")).rows[0].id as string;
    let state = (await db.pool.query("select status, amount_paid, balance_due from invoices where id = $1", [invoiceId])).rows[0];
    expect(state).toEqual({ status: "partially_paid", amount_paid: "100.00", balance_due: "249.99" });

    // More than the balance is refused.
    await expectPgError(pay("300.00"), "23514");
    // An invoice with payments cannot be voided.
    await expectPgError(asUser(db, accountant, (s) => s.query("select void_invoice($1, 'greșeală')", [invoiceId])), "22023");

    await pay("249.99");
    state = (await db.pool.query("select status, balance_due, paid_at is not null as paid from invoices where id = $1", [invoiceId])).rows[0];
    expect(state).toEqual({ status: "paid", balance_due: "0.00", paid: true });

    // Voiding a payment reopens the balance.
    await asUser(db, accountant, (s) => s.query("select void_payment($1, 'retur bancar')", [first]));
    state = (await db.pool.query("select status, balance_due from invoices where id = $1", [invoiceId])).rows[0];
    expect(state).toEqual({ status: "partially_paid", balance_due: "100.00" });

    // The payment list on the invoice page (payments.read) sees both, one voided.
    const { rows } = await asUser(db, viewer, (s) =>
      s.query("select a.amount, p.voided_at is not null as voided from payment_allocations a join payments p on p.id = a.payment_id where a.invoice_id = $1 order by a.created_at", [invoiceId]),
    );
    expect(rows).toEqual([
      { amount: "100.00", voided: true },
      { amount: "249.99", voided: false },
    ]);
  });

  it("lets only management delete draft estimates and never sent ones", async () => {
    const est = await newEstimate(manager);
    await expect(asUser(db, manager, (s) => s.query("delete from estimates where id = $1 returning id", [est.id]))).resolves.toMatchObject({ rowCount: 0 });
    await asUser(db, owner, (s) => s.query("update estimates set status = 'sent' where id = $1", [est.id]));
    await expect(asUser(db, owner, (s) => s.query("delete from estimates where id = $1 returning id", [est.id]))).resolves.toMatchObject({ rowCount: 0 });
    await asUser(db, owner, (s) => s.query("update estimates set status = 'draft' where id = $1", [est.id]));
    await expect(asUser(db, owner, (s) => s.query("delete from estimates where id = $1 returning id", [est.id]))).resolves.toMatchObject({ rowCount: 1 });
  });

  it("voids an unpaid issued invoice and flags overdue ones", async () => {
    const id = (
      await asUser(db, accountant, (s) =>
        s.query("insert into invoices (organization_id, customer_id, currency, issue_date, due_date, created_by) values ($1, $2, 'MDL', current_date - 30, current_date - 1, $3) returning id", [
          org,
          customer,
          accountant,
        ]),
      )
    ).rows[0].id as string;
    await addLine(accountant, "invoice_items", "invoice_id", id, 0, "1", "10");
    await asUser(db, accountant, (s) => s.query("select issue_invoice($1)", [id]));
    const overview = (await asUser(db, viewer, (s) => s.query("select is_overdue from invoice_overview where id = $1", [id]))).rows[0];
    expect(overview.is_overdue).toBe(true);

    await expectPgError(asUser(db, manager, (s) => s.query("select void_invoice($1, 'anulare')", [id])), "42501");
    await asUser(db, accountant, (s) => s.query("select void_invoice($1, 'emisă din greșeală')", [id]));
    const row = (await db.pool.query("select status, void_reason from invoices where id = $1", [id])).rows[0];
    expect(row).toEqual({ status: "void", void_reason: "emisă din greșeală" });
  });
});

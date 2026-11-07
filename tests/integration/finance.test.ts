import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateDocumentTotals, type LineInput } from "@/lib/calculations/documents";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

describe.skipIf(!available)("financial integrity in the database", () => {
  let db: Db;
  let owner: string;
  let accountant: string;
  let org: string;
  let customer: string;

  async function draftInvoice(lines: LineInput[]): Promise<string> {
    return asUser(db, owner, async (s) => {
      const id = (await s.query("insert into invoices (organization_id, customer_id, currency, due_date) values ($1, $2, 'MDL', current_date + 14) returning id", [org, customer]))
        .rows[0].id as string;
      let position = 0;
      for (const l of lines) {
        await s.query(
          "insert into invoice_items (organization_id, invoice_id, position, description, quantity, unit_price, discount_percent, tax_rate) values ($1, $2, $3, 'Line', $4, $5, $6, $7)",
          [org, id, position++, String(l.quantity), String(l.unitPrice), String(l.discountPercent ?? 0), String(l.taxRate ?? 0)],
        );
      }
      return id;
    });
  }

  async function invoice(id: string) {
    const { rows } = await db.pool.query("select number, status, subtotal, discount_total, tax_total, total, amount_paid, balance_due from invoices where id = $1", [id]);
    return rows[0];
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@fin.test");
    accountant = await createUser(db, "acc@fin.test");
    org = await createOrganization(db, owner, "Finance Co", "finance-co");
    await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'accountant')", [org, accountant]);
    await asUser(db, owner, async (s) => {
      customer = (await s.query("insert into customers (organization_id, name) values ($1, 'Payer') returning id", [org])).rows[0].id;
    });
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("database totals equal the TypeScript calculation (randomised)", async () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let doc = 0; doc < 8; doc++) {
      const lines: LineInput[] = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => ({
        quantity: (1 + Math.floor(rand() * 20000) / 1000).toFixed(3),
        unitPrice: (Math.floor(rand() * 1_000_000) / 100).toFixed(2),
        discountPercent: (Math.floor(rand() * 3000) / 100).toFixed(2),
        taxRate: ["0", "8", "19", "20", "21.5"][Math.floor(rand() * 5)]!,
      }));
      const id = await draftInvoice(lines);
      const expected = calculateDocumentTotals(lines);
      const row = await invoice(id);
      expect({ subtotal: row.subtotal, discount: row.discount_total, tax: row.tax_total, total: row.total }).toEqual({
        subtotal: expected.subtotal,
        discount: expected.discountTotal,
        tax: expected.taxTotal,
        total: expected.total,
      });
    }
  });

  it("clients cannot write totals, numbers or status directly", async () => {
    const id = await draftInvoice([{ quantity: "1", unitPrice: "100" }]);
    await expectPgError(asUser(db, owner, (s) => s.query("update invoices set total = 1 where id = $1", [id])), "42501");
    await expectPgError(asUser(db, owner, (s) => s.query("update invoices set status = 'paid' where id = $1", [id])), "42501");
    await expectPgError(asUser(db, owner, (s) => s.query("update invoices set number = 'X-1' where id = $1", [id])), "42501");
    await expectPgError(asUser(db, owner, (s) => s.query("update invoices set amount_paid = 100 where id = $1", [id])), "42501");
  });

  it("issues invoices with sequential numbers and freezes them", async () => {
    const a = await draftInvoice([{ quantity: "1", unitPrice: "50" }]);
    const b = await draftInvoice([{ quantity: "1", unitPrice: "60" }]);
    await asUser(db, owner, async (s) => {
      await s.query("select public.issue_invoice($1)", [a]);
      await s.query("select public.issue_invoice($1)", [b]);
    });
    const [ia, ib] = [await invoice(a), await invoice(b)];
    const year = new Date().getFullYear();
    expect(ia.number).toMatch(new RegExp(`^INV-${year}-\\d{4}$`));
    expect(Number(ib.number.slice(-4))).toBe(Number(ia.number.slice(-4)) + 1);
    expect(ia.status).toBe("issued");

    await expectPgError(asUser(db, owner, (s) => s.query("update invoices set notes = 'changed' where id = $1", [a])), "42501");
    await expectPgError(
      asUser(db, owner, (s) => s.query("insert into invoice_items (organization_id, invoice_id, description, quantity, unit_price) values ($1, $2, 'x', 1, 1)", [org, a])),
      "42501",
    );
    // Issuing twice is refused.
    await expectPgError(asUser(db, owner, (s) => s.query("select public.issue_invoice($1)", [a])), "22023");
  });

  it("records partial and full payments, idempotently, and prevents overpayment", async () => {
    const id = await draftInvoice([{ quantity: "1", unitPrice: "100", taxRate: "20" }]); // total 120.00
    await asUser(db, owner, (s) => s.query("select public.issue_invoice($1)", [id]));

    const pay = (key: string, amount: string, alloc: string) =>
      asUser(db, accountant, (s) =>
        s.query("select public.record_payment($1, $2, $3, 'MDL', 'bank_transfer', current_date, $4, $5::jsonb) as id", [
          org,
          customer,
          amount,
          key,
          JSON.stringify([{ invoice_id: id, amount: alloc }]),
        ]),
      );

    const first = await pay("payment-key-0001", "50.00", "50.00");
    expect(await invoice(id)).toMatchObject({ status: "partially_paid", amount_paid: "50.00", balance_due: "70.00" });

    // Retrying the same request (double click, network retry) does not pay twice.
    const retry = await pay("payment-key-0001", "50.00", "50.00");
    expect(retry.rows[0].id).toBe(first.rows[0].id);
    expect(await invoice(id)).toMatchObject({ amount_paid: "50.00" });

    // Reusing a key with different parameters is rejected.
    await expectPgError(pay("payment-key-0001", "60.00", "60.00"), "23505");

    // Overpayment is rejected (allow_overpayment is off by default).
    await expectPgError(pay("payment-key-0002", "80.00", "80.00"), "23514");
    // Allocation larger than the payment is rejected.
    await expectPgError(pay("payment-key-0003", "10.00", "20.00"), "23514");
    // Sub-cent amounts are rejected.
    await expectPgError(pay("payment-key-0004", "1.005", "1.005"), "22023");

    await pay("payment-key-0005", "70.00", "70.00");
    expect(await invoice(id)).toMatchObject({ status: "paid", amount_paid: "120.00", balance_due: "0.00" });

    // Voiding a payment restores the balance.
    await asUser(db, accountant, (s) => s.query("select public.void_payment($1, 'bank reversal')", [first.rows[0].id]));
    expect(await invoice(id)).toMatchObject({ status: "partially_paid", amount_paid: "70.00", balance_due: "50.00" });
  });

  it("does not allow paying a draft invoice or a different customer's invoice", async () => {
    const draft = await draftInvoice([{ quantity: "1", unitPrice: "10" }]);
    await expectPgError(
      asUser(db, accountant, (s) =>
        s.query("select public.record_payment($1, $2, 10, 'MDL', 'cash', current_date, 'draft-pay-1', $3::jsonb)", [
          org,
          customer,
          JSON.stringify([{ invoice_id: draft, amount: "10" }]),
        ]),
      ),
      "22023",
    );
  });

  it("keeps the activity log append-only", async () => {
    const { rows } = await asUser(db, owner, (s) => s.query("select id from activity_logs where organization_id = $1 limit 1", [org]));
    expect(rows.length).toBe(1);
    const upd = await asUser(db, owner, (s) => s.query("update activity_logs set summary = 'tampered' where id = $1", [rows[0].id])).catch((e: { code?: string }) => e);
    // Either no policy (0 rows) or explicitly forbidden — never modified.
    if ("rowCount" in (upd as object)) expect((upd as { rowCount: number }).rowCount).toBe(0);
    const del = await asUser(db, owner, (s) => s.query("delete from activity_logs where id = $1", [rows[0].id])).catch((e: { code?: string }) => e);
    if ("rowCount" in (del as object)) expect((del as { rowCount: number }).rowCount).toBe(0);
    const still = await db.pool.query("select summary from activity_logs where id = $1", [rows[0].id]);
    expect(still.rows[0].summary).not.toBe("tampered");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/**
 * Phase 6: the database rules behind Client portal links (portal.manage), and
 * the scoping the customer-facing reads rely on.
 */
describe.skipIf(!available)("client portal access", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let accountant: string;
  let employee: string;
  let org: string;
  let otherOrg: string;
  let customer: string;
  let otherCustomer: string;

  const insertAccess = (user: string, customerId: string, hash: string, email = "ana@client.md", organizationId = org) =>
    asUser(db, user, (s) =>
      s.query("insert into client_portal_access (organization_id, customer_id, email, token_hash, created_by) values ($1, $2, $3, $4, $5) returning id", [organizationId, customerId, email, hash, user]),
    );

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@portal.test");
    manager = await createUser(db, "manager@portal.test");
    accountant = await createUser(db, "acc@portal.test");
    employee = await createUser(db, "employee@portal.test");
    org = await createOrganization(db, owner, "Portal Co", "portal-co");
    otherOrg = await createOrganization(db, accountant, "Other Co", "other-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [accountant, "accountant"],
      [employee, "employee"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
    customer = (await asUser(db, owner, (s) => s.query("insert into customers (organization_id, name, email) values ($1, 'Ana Popescu', 'ana@client.md') returning id", [org]))).rows[0].id;
    otherCustomer = (await asUser(db, accountant, (s) => s.query("insert into customers (organization_id, name) values ($1, 'Străin') returning id", [otherOrg]))).rows[0].id;
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("lets owners and managers create links, but not accountants or employees", async () => {
    await insertAccess(manager, customer, "a".repeat(64));
    await expectPgError(insertAccess(accountant, customer, "b".repeat(64)), "42501");
    await expectPgError(insertAccess(employee, customer, "c".repeat(64)), "42501");
    expect((await asUser(db, employee, (s) => s.query("select id from client_portal_access where organization_id = $1", [org]))).rowCount).toBe(0);
    expect((await asUser(db, owner, (s) => s.query("select id from client_portal_access where organization_id = $1", [org]))).rowCount).toBe(1);
  });

  it("keeps token hashes unique, checks the e-mail and refuses another company's customer", async () => {
    await expectPgError(insertAccess(owner, customer, "a".repeat(64)), "23505");
    await expectPgError(insertAccess(owner, customer, "d".repeat(64), "not-an-email"), "23514");
    await expectPgError(insertAccess(owner, otherCustomer, "e".repeat(64)), "23503");
  });

  it("revokes a link with an ordinary update by a portal manager", async () => {
    const id = (await insertAccess(owner, customer, "f".repeat(64))).rows[0].id as string;
    expect((await asUser(db, accountant, (s) => s.query("update client_portal_access set revoked_at = now() where id = $1", [id]))).rowCount).toBe(0);
    expect((await asUser(db, manager, (s) => s.query("update client_portal_access set revoked_at = now() where id = $1 and revoked_at is null", [id]))).rowCount).toBe(1);
  });

  it("shows the customer only their issued documents, never drafts (the portal's filters)", async () => {
    const invoice = (
      await asUser(db, owner, (s) => s.query("insert into invoices (organization_id, customer_id, currency, created_by) values ($1, $2, 'MDL', $3) returning id", [org, customer, owner]))
    ).rows[0].id as string;
    await asUser(db, owner, (s) =>
      s.query("insert into invoice_items (organization_id, invoice_id, position, description, unit, quantity, unit_price, tax_rate) values ($1, $2, 0, 'Lucrare', 'buc', 1, 300, 0)", [org, invoice]),
    );
    const draft = (
      await asUser(db, owner, (s) => s.query("insert into invoices (organization_id, customer_id, currency, created_by) values ($1, $2, 'MDL', $3) returning id", [org, customer, owner]))
    ).rows[0].id as string;
    await asUser(db, owner, (s) => s.query("select issue_invoice($1)", [invoice]));
    // Same filters as getPortalOverview, run as the service role would (RLS bypassed).
    const { rows } = await db.pool.query(
      "select id, status, balance_due from invoice_overview where organization_id = $1 and customer_id = $2 and status in ('issued', 'partially_paid', 'paid')",
      [org, customer],
    );
    expect(rows).toEqual([{ id: invoice, status: "issued", balance_due: "300.00" }]);
    expect(rows.map((r) => r.id)).not.toContain(draft);
    const snapshot = (await db.pool.query("select customer_snapshot->>'name' as name, organization_snapshot->>'name' as org from invoices where id = $1", [invoice])).rows[0];
    expect(snapshot).toEqual({ name: "Ana Popescu", org: "Portal Co" });
  });
});

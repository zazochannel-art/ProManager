import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Phase 7: who may add, see and remove files, and the rules the portal relies on. */
describe.skipIf(!available)("documents", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let accountant: string;
  let employee: string;
  let org: string;
  let otherOrg: string;
  let customer: string;
  let otherCustomer: string;
  let n = 0;

  const insertDoc = (user: string, opts: { organizationId?: string; customerId?: string; path?: string; visible?: boolean } = {}) => {
    const organizationId = opts.organizationId ?? org;
    const customerId = opts.customerId ?? customer;
    n += 1;
    const path = opts.path ?? `${organizationId}/customer/${customerId}/00000000-0000-4000-8000-${String(n).padStart(12, "0")}-file.pdf`;
    return asUser(db, user, (s) =>
      s.query(
        `insert into documents (organization_id, storage_path, file_name, mime_type, size_bytes, entity_type, entity_id, customer_id, is_client_visible, uploaded_by)
         values ($1, $2, 'file.pdf', 'application/pdf', 1000, 'customer', $3, $3, $4, $5) returning id`,
        [organizationId, path, customerId, opts.visible ?? false, user],
      ),
    );
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@docs.test");
    manager = await createUser(db, "manager@docs.test");
    accountant = await createUser(db, "acc@docs.test");
    employee = await createUser(db, "employee@docs.test");
    org = await createOrganization(db, owner, "Docs Co", "docs-co");
    otherOrg = await createOrganization(db, accountant, "Other Docs", "other-docs");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [accountant, "accountant"],
      [employee, "employee"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
    customer = (await asUser(db, owner, (s) => s.query("insert into customers (organization_id, name) values ($1, 'Ana') returning id", [org]))).rows[0].id;
    otherCustomer = (await asUser(db, accountant, (s) => s.query("insert into customers (organization_id, name) values ($1, 'Străin') returning id", [otherOrg]))).rows[0].id;
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("lets owners, managers and accountants add files, but not employees", async () => {
    await insertDoc(owner);
    await insertDoc(manager);
    await insertDoc(accountant);
    await expectPgError(insertDoc(employee), "42501");
    expect((await asUser(db, employee, (s) => s.query("select id from documents where organization_id = $1", [org]))).rowCount).toBe(3);
  });

  it("keeps files inside the company's own folder and customers", async () => {
    await expectPgError(insertDoc(owner, { path: `${otherOrg}/customer/${customer}/00000000-0000-4000-8000-000000000999-x.pdf` }), "23514");
    await expectPgError(insertDoc(accountant, { customerId: otherCustomer }), "23503");
  });

  it("lets only owners and admins delete files", async () => {
    const id = (await insertDoc(owner)).rows[0].id;
    const asManager = await asUser(db, manager, (s) => s.query("delete from documents where id = $1", [id]));
    expect(asManager.rowCount).toBe(0);
    const asOwner = await asUser(db, owner, (s) => s.query("delete from documents where id = $1", [id]));
    expect(asOwner.rowCount).toBe(1);
  });

  it("hides files from another company", async () => {
    await insertDoc(owner, { visible: true });
    expect((await asUser(db, accountant, (s) => s.query("select id from documents where organization_id = $1 and is_client_visible", [otherOrg]))).rowCount).toBe(0);
    const outsider = await createUser(db, "outsider@docs.test");
    expect((await asUser(db, outsider, (s) => s.query("select id from documents"))).rowCount).toBe(0);
  });

  it("stores whether the portal may show files", async () => {
    const row = await asUser(db, owner, (s) =>
      s.query("insert into client_portal_access (organization_id, customer_id, email, token_hash, created_by, can_view_documents) values ($1, $2, 'a@b.md', $3, $4, true) returning can_view_documents", [org, customer, "e".repeat(64), owner]),
    );
    expect(row.rows[0].can_view_documents).toBe(true);
  });
});

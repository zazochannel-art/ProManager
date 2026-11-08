import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Phase 3: the database rules behind the customer and project detail pages. */
describe.skipIf(!available)("customer and project detail workflows", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let employee: string;
  let outsider: string;
  let org: string;
  let otherOrg: string;
  let customer: string;
  let project: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@detail.test");
    manager = await createUser(db, "manager@detail.test");
    employee = await createUser(db, "employee@detail.test");
    outsider = await createUser(db, "outsider@detail.test");
    org = await createOrganization(db, owner, "Detail Co", "detail-co");
    otherOrg = await createOrganization(db, outsider, "Other Co", "other-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [employee, "employee"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
    customer = (
      await asUser(db, owner, (s) => s.query("insert into customers (organization_id, name, type) values ($1, 'Client SRL', 'company') returning id", [org]))
    ).rows[0].id;
    project = (
      await asUser(db, owner, (s) =>
        s.query("insert into projects (organization_id, customer_id, name, currency) values ($1, $2, 'Renovare', 'MDL') returning id", [org, customer]),
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  describe("archiving needs the delete permission", () => {
    it("lets a manager edit a customer and a project but not archive them", async () => {
      await asUser(db, manager, (s) => s.query("update customers set phone = '+37360000000' where id = $1", [customer]));
      await asUser(db, manager, (s) => s.query("update projects set status = 'active' where id = $1", [project]));
      await expectPgError(asUser(db, manager, (s) => s.query("update customers set deleted_at = now() where id = $1", [customer])), "42501");
      await expectPgError(asUser(db, manager, (s) => s.query("update projects set deleted_at = now() where id = $1", [project])), "42501");
    });

    it("lets the owner archive and restore", async () => {
      const temp = (
        await asUser(db, owner, (s) => s.query("insert into projects (organization_id, name, currency) values ($1, 'Temp', 'MDL') returning id", [org]))
      ).rows[0].id;
      await asUser(db, owner, (s) => s.query("update projects set deleted_at = now() where id = $1", [temp]));
      await asUser(db, owner, (s) => s.query("update projects set deleted_at = null where id = $1", [temp]));
      const { rows } = await db.pool.query("select deleted_at from projects where id = $1", [temp]);
      expect(rows[0].deleted_at).toBeNull();
    });
  });

  describe("contacts and addresses", () => {
    it("are tied to a customer of the same organization", async () => {
      await asUser(db, manager, (s) =>
        s.query("insert into customer_contacts (organization_id, customer_id, full_name, is_primary) values ($1, $2, 'Ion Popescu', true)", [org, customer]),
      );
      await asUser(db, manager, (s) =>
        s.query("insert into customer_addresses (organization_id, customer_id, type, line1, country_code) values ($1, $2, 'site', 'str. Ștefan cel Mare 1', 'MD')", [
          org,
          customer,
        ]),
      );
      // A member of another organization cannot attach rows to this customer, even with its id.
      await expectPgError(
        asUser(db, outsider, (s) =>
          s.query("insert into customer_contacts (organization_id, customer_id, full_name) values ($1, $2, 'Intrus')", [otherOrg, customer]),
        ),
        "23503",
      );
      await expectPgError(
        asUser(db, outsider, (s) => s.query("insert into customer_contacts (organization_id, customer_id, full_name) values ($1, $2, 'Intrus')", [org, customer])),
        "42501",
      );
      const seen = await asUser(db, outsider, (s) => s.query("select id from customer_contacts where customer_id = $1", [customer]));
      expect(seen.rowCount).toBe(0);
    });

    it("are read-only for employees", async () => {
      const visible = await asUser(db, employee, (s) => s.query("select full_name from customer_contacts where customer_id = $1", [customer]));
      expect(visible.rows).toEqual([{ full_name: "Ion Popescu" }]);
      await expectPgError(
        asUser(db, employee, (s) => s.query("insert into customer_contacts (organization_id, customer_id, full_name) values ($1, $2, 'X')", [org, customer])),
        "42501",
      );
      const deleted = await asUser(db, employee, (s) => s.query("delete from customer_contacts where customer_id = $1", [customer]));
      expect(deleted.rowCount).toBe(0);
    });
  });

  describe("project tasks", () => {
    let task: string;

    beforeAll(async () => {
      task = (
        await asUser(db, manager, (s) =>
          s.query("insert into tasks (organization_id, project_id, title, priority, assignee_id) values ($1, $2, 'Demontare', 'high', $3) returning id", [
            org,
            project,
            employee,
          ]),
        )
      ).rows[0].id;
    });

    it("lets the assignee change only the status of their own task", async () => {
      await asUser(db, employee, (s) => s.query("update tasks set status = 'done' where id = $1", [task]));
      const { rows } = await db.pool.query("select status, completed_at from tasks where id = $1", [task]);
      expect(rows[0].status).toBe("done");
      expect(rows[0].completed_at).not.toBeNull();
      await expectPgError(asUser(db, employee, (s) => s.query("update tasks set title = 'Altceva' where id = $1", [task])), "42501");
    });

    it("does not let an employee change somebody else's task", async () => {
      const other = (
        await asUser(db, manager, (s) => s.query("insert into tasks (organization_id, project_id, title) values ($1, $2, 'Zugrăvit') returning id", [org, project]))
      ).rows[0].id;
      const updated = await asUser(db, employee, (s) => s.query("update tasks set status = 'done' where id = $1", [other]));
      expect(updated.rowCount).toBe(0);
    });

    it("rejects an assignee who is not a member of the organization", async () => {
      await expectPgError(
        asUser(db, manager, (s) =>
          s.query("insert into tasks (organization_id, project_id, title, assignee_id) values ($1, $2, 'X', $3)", [org, project, outsider]),
        ),
        "23503",
      );
    });
  });

  describe("project financials", () => {
    it("are computed for the project and hidden from other organizations", async () => {
      const { rows } = await asUser(db, owner, (s) => s.query("select public.project_financials($1, $2) as f", [org, project]));
      expect(rows[0].f).toMatchObject({ currency: "MDL", excluded_foreign_currency_items: 0 });
      const foreign = await asUser(db, outsider, (s) => s.query("select public.project_financials($1, $2) as f", [org, project]));
      expect(foreign.rows[0].f).toBeNull();
    });
  });
});

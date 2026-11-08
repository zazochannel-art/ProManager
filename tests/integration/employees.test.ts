import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Phase 3: the database rules behind the team (employees) page. */
describe.skipIf(!available)("team page workflows", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let employee: string;
  let outsider: string;
  let org: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@team.test");
    manager = await createUser(db, "manager@team.test");
    employee = await createUser(db, "employee@team.test");
    outsider = await createUser(db, "outsider@team.test");
    org = await createOrganization(db, owner, "Team Co", "team-co");
    await createOrganization(db, outsider, "Other Co", "other-team-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [employee, "employee"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("lets the owner add an employee linked to a member account, once", async () => {
    await asUser(db, owner, (s) =>
      s.query(
        "insert into employees (organization_id, user_id, first_name, last_name, employment_type, hourly_cost, cost_currency) values ($1, $2, 'Ion', 'Rusu', 'full_time', 120.50, 'MDL')",
        [org, employee],
      ),
    );
    await expectPgError(
      asUser(db, owner, (s) => s.query("insert into employees (organization_id, user_id, first_name) values ($1, $2, 'Dublură')", [org, employee])),
      "23505",
    );
  });

  it("rejects an account from another organization and a rate without currency", async () => {
    await expectPgError(
      asUser(db, owner, (s) => s.query("insert into employees (organization_id, user_id, first_name) values ($1, $2, 'Intrus')", [org, outsider])),
      "23503",
    );
    await expectPgError(
      asUser(db, owner, (s) => s.query("insert into employees (organization_id, first_name, hourly_cost) values ($1, 'Fără monedă', 100)", [org])),
      "23514",
    );
  });

  it("is readable by managers but managed only by owners and admins", async () => {
    const seen = await asUser(db, manager, (s) => s.query("select first_name, hourly_cost::text from employees where organization_id = $1", [org]));
    expect(seen.rows).toEqual([{ first_name: "Ion", hourly_cost: "120.50" }]);
    await expectPgError(asUser(db, manager, (s) => s.query("insert into employees (organization_id, first_name) values ($1, 'X')", [org])), "42501");
    const changed = await asUser(db, manager, (s) => s.query("update employees set hourly_cost = 1 where organization_id = $1", [org]));
    expect(changed.rowCount).toBe(0);
  });

  it("hides rates from employees", async () => {
    const seen = await asUser(db, employee, (s) => s.query("select id from employees where organization_id = $1", [org]));
    expect(seen.rowCount).toBe(0);
  });
});

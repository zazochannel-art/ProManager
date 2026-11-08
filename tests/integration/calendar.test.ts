import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Phase 3: the database rules behind the calendar page. */
describe.skipIf(!available)("calendar workflows", () => {
  let db: Db;
  let owner: string;
  let employee: string;
  let outsider: string;
  let org: string;
  let foreignProject: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@cal.test");
    employee = await createUser(db, "employee@cal.test");
    outsider = await createUser(db, "outsider@cal.test");
    org = await createOrganization(db, owner, "Cal Co", "cal-co");
    const otherOrg = await createOrganization(db, outsider, "Other Co", "other-cal-co");
    await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'employee')", [org, employee]);
    foreignProject = (
      await asUser(db, outsider, (s) => s.query("insert into projects (organization_id, name, currency) values ($1, 'Străin', 'MDL') returning id", [otherOrg]))
    ).rows[0].id;
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("lets managers add events that every member can see", async () => {
    await asUser(db, owner, (s) =>
      s.query("insert into events (organization_id, title, starts_at, ends_at) values ($1, 'Vizită șantier', '2026-11-10T07:00:00Z', '2026-11-10T08:00:00Z')", [org]),
    );
    const seen = await asUser(db, employee, (s) => s.query("select title from events where organization_id = $1", [org]));
    expect(seen.rows).toEqual([{ title: "Vizită șantier" }]);
    const foreign = await asUser(db, outsider, (s) => s.query("select id from events where organization_id = $1", [org]));
    expect(foreign.rowCount).toBe(0);
  });

  it("does not let employees create or delete events", async () => {
    await expectPgError(
      asUser(db, employee, (s) => s.query("insert into events (organization_id, title, starts_at, ends_at) values ($1, 'X', now(), now())", [org])),
      "42501",
    );
    const removed = await asUser(db, employee, (s) => s.query("delete from events where organization_id = $1", [org]));
    expect(removed.rowCount).toBe(0);
  });

  it("rejects an end before the start and another organization's project", async () => {
    await expectPgError(
      asUser(db, owner, (s) => s.query("insert into events (organization_id, title, starts_at, ends_at) values ($1, 'X', '2026-11-10T09:00:00Z', '2026-11-10T08:00:00Z')", [org])),
      "23514",
    );
    await expectPgError(
      asUser(db, owner, (s) =>
        s.query("insert into events (organization_id, title, starts_at, ends_at, project_id) values ($1, 'X', now(), now(), $2)", [org, foreignProject]),
      ),
      "23503",
    );
  });
});

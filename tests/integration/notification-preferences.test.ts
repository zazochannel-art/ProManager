import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Phase 8: each member's own notification choices, and the rows the server writes. */
describe.skipIf(!available)("notification preferences", () => {
  let db: Db;
  let owner: string;
  let employee: string;
  let org: string;

  const upsert = (user: string, target: string, event = "payment.recorded", channel = "email", enabled = true) =>
    asUser(db, user, (s) =>
      s.query(
        `insert into notification_preferences (organization_id, user_id, channel, event_type, enabled) values ($1, $2, $3, $4, $5)
         on conflict (organization_id, user_id, channel, event_type) do update set enabled = excluded.enabled returning enabled`,
        [org, target, channel, event, enabled],
      ),
    );

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@notify.test");
    employee = await createUser(db, "employee@notify.test");
    org = await createOrganization(db, owner, "Notify Co", "notify-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'employee')", [org, employee]);
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("lets members save and change only their own choices", async () => {
    expect((await upsert(owner, owner)).rows[0].enabled).toBe(true);
    expect((await upsert(owner, owner, "payment.recorded", "email", false)).rows[0].enabled).toBe(false);
    await expectPgError(upsert(employee, owner), "42501");
    expect((await asUser(db, employee, (s) => s.query("select id from notification_preferences where organization_id = $1", [org]))).rowCount).toBe(0);
  });

  it("keeps the in-app task notice off for someone who turned it off", async () => {
    await upsert(employee, employee, "task.assigned", "in_app", false);
    await asUser(db, owner, (s) => s.query("insert into tasks (organization_id, title, assignee_id) values ($1, 'Montaj', $2)", [org, employee]));
    expect((await db.pool.query("select id from notifications where user_id = $1 and type = 'task.assigned'", [employee])).rowCount).toBe(0);
    await upsert(employee, employee, "task.assigned", "in_app", true);
    await asUser(db, owner, (s) => s.query("insert into tasks (organization_id, title, assignee_id) values ($1, 'Vopsit', $2)", [org, employee]));
    expect((await db.pool.query("select id from notifications where user_id = $1 and type = 'task.assigned'", [employee])).rowCount).toBe(1);
  });

  it("accepts the links the server writes, and members cannot write notices themselves", async () => {
    for (const link of ["/dashboard/inventory?view=low", "/dashboard/settings?tab=members", "/dashboard/client-portal"]) {
      await db.pool.query("insert into notifications (organization_id, user_id, type, title, link_path) values ($1, $2, 'stock.low', 'x', $3)", [org, owner, link]);
    }
    await expectPgError(
      asUser(db, employee, (s) => s.query("insert into notifications (organization_id, user_id, type, title) values ($1, $2, 'stock.low', 'x')", [org, owner])),
      "42501",
    );
  });
});

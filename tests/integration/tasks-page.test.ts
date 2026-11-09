import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Phase 3: the database rules behind the organization-wide tasks page. */
describe.skipIf(!available)("tasks page workflows", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let employee: string;
  let viewer: string;
  let outsider: string;
  let org: string;
  let otherOrg: string;
  let foreignProject: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@tasks.test");
    manager = await createUser(db, "manager@tasks.test");
    employee = await createUser(db, "employee@tasks.test");
    viewer = await createUser(db, "viewer@tasks.test");
    outsider = await createUser(db, "outsider@tasks.test");
    org = await createOrganization(db, owner, "Tasks Co", "tasks-co");
    otherOrg = await createOrganization(db, outsider, "Other Co", "other-tasks-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [employee, "employee"],
      [viewer, "viewer"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
    foreignProject = (
      await asUser(db, outsider, (s) => s.query("insert into projects (organization_id, name, currency) values ($1, 'Străin', 'MDL') returning id", [otherOrg]))
    ).rows[0].id;
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("lets a manager create a task without a project", async () => {
    const { rows } = await asUser(db, manager, (s) =>
      s.query("insert into tasks (organization_id, title, priority, assignee_id, due_at) values ($1, 'Comandă materiale', 'urgent', $2, '2026-01-05T12:00:00Z') returning project_id", [
        org,
        employee,
      ]),
    );
    expect(rows[0].project_id).toBeNull();
  });

  it("rejects linking a task to another organization's project", async () => {
    await expectPgError(
      asUser(db, manager, (s) => s.query("insert into tasks (organization_id, project_id, title) values ($1, $2, 'Intrus')", [org, foreignProject])),
      "23503",
    );
  });

  it("does not let employees or viewers create tasks", async () => {
    for (const user of [employee, viewer]) {
      await expectPgError(asUser(db, user, (s) => s.query("insert into tasks (organization_id, title) values ($1, 'X')", [org])), "42501");
    }
  });

  it("lets the assignee close a standalone task but not delete it", async () => {
    const task = (await db.pool.query("select id from tasks where organization_id = $1 and title = 'Comandă materiale'", [org])).rows[0].id;
    await asUser(db, employee, (s) => s.query("update tasks set status = 'in_progress' where id = $1", [task]));
    await expectPgError(asUser(db, employee, (s) => s.query("update tasks set deleted_at = now() where id = $1", [task])), "42501");
    const { rows } = await db.pool.query("select status, deleted_at from tasks where id = $1", [task]);
    expect(rows[0]).toEqual({ status: "in_progress", deleted_at: null });
  });

  it("shows the open, overdue and assigned counts the page uses", async () => {
    const { rows } = await asUser(db, viewer, (s) =>
      s.query(
        `select count(*) filter (where status in ('todo','in_progress','blocked'))::int as open,
                count(*) filter (where status in ('todo','in_progress','blocked') and due_at < '2026-11-08T00:00:00Z')::int as overdue,
                count(*) filter (where status in ('todo','in_progress','blocked') and assignee_id = $2)::int as mine
           from tasks where organization_id = $1 and deleted_at is null`,
        [org, employee],
      ),
    );
    expect(rows[0]).toEqual({ open: 1, overdue: 1, mine: 1 });
    const foreign = await asUser(db, outsider, (s) => s.query("select id from tasks where organization_id = $1", [org]));
    expect(foreign.rowCount).toBe(0);
  });
});

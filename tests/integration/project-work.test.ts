import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Phase 3: phases, project team and time tracking on the project page. */
describe.skipIf(!available)("project phases, team and time", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let employee: string;
  let outsider: string;
  let org: string;
  let otherOrg: string;
  let project: string;
  let foreignProject: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@work.test");
    manager = await createUser(db, "manager@work.test");
    employee = await createUser(db, "employee@work.test");
    outsider = await createUser(db, "outsider@work.test");
    org = await createOrganization(db, owner, "Work Co", "work-co");
    otherOrg = await createOrganization(db, outsider, "Other Co", "other-work-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [employee, "employee"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
    // The employee's cost rate lives on the HR record.
    await db.pool.query(
      "insert into employees (organization_id, user_id, first_name, hourly_cost, cost_currency) values ($1, $2, 'Ion', 150, 'MDL')",
      [org, employee],
    );
    project = (
      await asUser(db, owner, (s) => s.query("insert into projects (organization_id, name, currency) values ($1, 'Renovare', 'MDL') returning id", [org]))
    ).rows[0].id;
    foreignProject = (
      await asUser(db, outsider, (s) => s.query("insert into projects (organization_id, name, currency) values ($1, 'Străin', 'MDL') returning id", [otherOrg]))
    ).rows[0].id;
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  describe("phases", () => {
    it("are managed with projects.write and read by every member", async () => {
      await asUser(db, manager, (s) =>
        s.query("insert into project_tasks (organization_id, project_id, name, planned_hours, sort_order) values ($1, $2, 'Demontare', 16.5, 0)", [org, project]),
      );
      await expectPgError(
        asUser(db, employee, (s) => s.query("insert into project_tasks (organization_id, project_id, name) values ($1, $2, 'X')", [org, project])),
        "42501",
      );
      const updated = await asUser(db, employee, (s) => s.query("update project_tasks set progress_percent = 100 where project_id = $1", [project]));
      expect(updated.rowCount).toBe(0);
      const seen = await asUser(db, employee, (s) => s.query("select name, planned_hours::text, progress_percent from project_tasks where project_id = $1", [project]));
      expect(seen.rows).toEqual([{ name: "Demontare", planned_hours: "16.50", progress_percent: 0 }]);
    });

    it("reject progress outside 0–100 and another organization's project", async () => {
      await expectPgError(asUser(db, manager, (s) => s.query("update project_tasks set progress_percent = 120 where project_id = $1", [project])), "23514");
      await expectPgError(
        asUser(db, manager, (s) => s.query("insert into project_tasks (organization_id, project_id, name) values ($1, $2, 'Intrus')", [org, foreignProject])),
        "23503",
      );
    });
  });

  describe("project team", () => {
    it("accepts organization members once and rejects outsiders", async () => {
      await asUser(db, manager, (s) =>
        s.query("insert into project_members (organization_id, project_id, user_id, project_role) values ($1, $2, $3, 'lead')", [org, project, employee]),
      );
      await expectPgError(
        asUser(db, manager, (s) => s.query("insert into project_members (organization_id, project_id, user_id) values ($1, $2, $3)", [org, project, employee])),
        "23505",
      );
      await expectPgError(
        asUser(db, manager, (s) => s.query("insert into project_members (organization_id, project_id, user_id) values ($1, $2, $3)", [org, project, outsider])),
        "23503",
      );
      await expectPgError(
        asUser(db, manager, (s) =>
          s.query("insert into project_members (organization_id, project_id, user_id, project_role) values ($1, $2, $3, 'boss')", [org, project, manager]),
        ),
        "23514",
      );
    });

    it("cannot be changed by employees", async () => {
      await expectPgError(
        asUser(db, employee, (s) => s.query("insert into project_members (organization_id, project_id, user_id) values ($1, $2, $3)", [org, project, manager])),
        "42501",
      );
      const removed = await asUser(db, employee, (s) => s.query("delete from project_members where project_id = $1", [project]));
      expect(removed.rowCount).toBe(0);
    });
  });

  describe("time entries", () => {
    it("take the hourly cost from the employee record, not from the request", async () => {
      const { rows } = await asUser(db, employee, (s) =>
        s.query(
          `insert into time_entries (organization_id, project_id, user_id, started_at, duration_minutes, hourly_cost, cost_currency)
           values ($1, $2, $3, '2026-11-05T12:00:00Z', 480, 9999, 'MDL') returning id, hourly_cost::text, cost_currency`,
          [org, project, employee],
        ),
      );
      expect(rows[0]).toMatchObject({ hourly_cost: "150.00", cost_currency: "MDL" });
      await asUser(db, employee, (s) => s.query("update time_entries set hourly_cost = 1, duration_minutes = 450 where id = $1", [rows[0].id]));
      const after = await db.pool.query("select hourly_cost::text, duration_minutes from time_entries where id = $1", [rows[0].id]);
      expect(after.rows[0]).toEqual({ hourly_cost: "150.00", duration_minutes: 450 });
    });

    it("lets a manager log for a colleague and override the rate", async () => {
      const filled = await asUser(db, manager, (s) =>
        s.query(
          "insert into time_entries (organization_id, project_id, user_id, started_at, duration_minutes) values ($1, $2, $3, '2026-11-06T12:00:00Z', 60) returning hourly_cost::text",
          [org, project, employee],
        ),
      );
      expect(filled.rows[0].hourly_cost).toBe("150.00");
      const custom = await asUser(db, manager, (s) =>
        s.query(
          "insert into time_entries (organization_id, project_id, user_id, started_at, duration_minutes, hourly_cost, cost_currency) values ($1, $2, $3, '2026-11-06T12:00:00Z', 60, 200, 'MDL') returning hourly_cost::text",
          [org, project, employee],
        ),
      );
      expect(custom.rows[0].hourly_cost).toBe("200.00");
      // A member without an HR record has no rate (no invented cost).
      const noRate = await asUser(db, manager, (s) =>
        s.query(
          "insert into time_entries (organization_id, project_id, user_id, started_at, duration_minutes) values ($1, $2, $3, '2026-11-06T12:00:00Z', 30) returning id, hourly_cost",
          [org, project, manager],
        ),
      );
      expect(noRate.rows[0].hourly_cost).toBeNull();
      await db.pool.query("delete from time_entries where id = $1", [noRate.rows[0].id]);
    });

    it("derive the duration from start and end", async () => {
      const { rows } = await asUser(db, employee, (s) =>
        s.query(
          "insert into time_entries (organization_id, project_id, user_id, started_at, ended_at, duration_minutes) values ($1, $2, $3, '2026-11-07T08:00:00Z', '2026-11-07T10:30:00Z', 5) returning id, duration_minutes",
          [org, project, employee],
        ),
      );
      expect(rows[0].duration_minutes).toBe(150);
      await db.pool.query("delete from time_entries where id = $1", [rows[0].id]);
    });

    it("do not let an employee log time for someone else", async () => {
      await expectPgError(
        asUser(db, employee, (s) =>
          s.query("insert into time_entries (organization_id, project_id, user_id, started_at, duration_minutes) values ($1, $2, $3, now(), 60)", [org, project, manager]),
        ),
        "42501",
      );
    });

    it("feed the project's labour cost", async () => {
      // 450 min × 150 + 60 min × 150 + 60 min × 200 = 1125 + 150 + 200
      const { rows } = await asUser(db, owner, (s) => s.query("select public.project_financials($1, $2) as f", [org, project]));
      expect(Number(rows[0].f.labor_time_cost)).toBe(1475);
    });
  });
});

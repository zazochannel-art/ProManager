import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/** Regression tests for the Phase 1-2 review findings (migration 20261108000100_hardening). */
describe.skipIf(!available)("hardening after the Phase 1-2 review", () => {
  let db: Db;
  let owner: string;
  let admin: string;
  let admin2: string;
  let employee: string;
  let org: string;

  async function addMember(userId: string, role: string, organizationId = org) {
    await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [organizationId, userId, role]);
  }
  async function setPlan(code: string, status = "active", trialEndsAt: Date | null = null, organizationId = org) {
    await db.pool.query(
      "update subscriptions set plan_id = (select id from plans where code = $1), status = $2, trial_ends_at = $3 where organization_id = $4",
      [code, status, trialEndsAt, organizationId],
    );
  }
  const insertCustomer = (userId: string, name: string, organizationId = org) =>
    asUser(db, userId, (s) => s.query("insert into customers (organization_id, name, type) values ($1, $2, 'company') returning id", [organizationId, name]));

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@hard.test");
    admin = await createUser(db, "admin@hard.test");
    admin2 = await createUser(db, "admin2@hard.test");
    employee = await createUser(db, "employee@hard.test");
    org = await createOrganization(db, owner, "Hardening Co", "hardening");
    await setPlan("business");
    await addMember(admin, "admin");
    await addMember(admin2, "admin");
    await addMember(employee, "employee");
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  describe("plan limits fail closed", () => {
    it("falls back to the default plan when the subscription is canceled or paused", async () => {
      for (const status of ["canceled", "paused"]) {
        await setPlan("business", status);
        const { rows } = await db.pool.query("select private.plan_limit($1, 'max_customers') as l", [org]);
        expect(rows[0].l).toBe(50);
      }
    });

    it("falls back to the default plan once the trial has ended", async () => {
      await setPlan("business", "trialing", new Date(Date.now() - 60_000));
      const ended = await db.pool.query("select private.plan_limit($1, 'max_members') as l", [org]);
      expect(ended.rows[0].l).toBe(2);
      await setPlan("business", "trialing", new Date(Date.now() + 86_400_000));
      const running = await db.pool.query("select private.plan_limit($1, 'max_members') as l", [org]);
      expect(running.rows[0].l).toBe(15);
    });

    it("re-checks the limit when a soft-deleted customer is restored", async () => {
      const limited = await createUser(db, "limited@hard.test");
      const small = await createOrganization(db, limited, "Small Co", "small-co");
      await db.pool.query(
        "update plans set limits = limits || '{\"max_customers\": 1}' where code = 'free'",
      );
      try {
        const first = await insertCustomer(limited, "First", small);
        await asUser(db, limited, (s) => s.query("update customers set deleted_at = now() where id = $1", [first.rows[0].id]));
        await insertCustomer(limited, "Second", small);
        await expectPgError(
          asUser(db, limited, (s) => s.query("update customers set deleted_at = null where id = $1", [first.rows[0].id])),
          "54000",
        );
      } finally {
        await db.pool.query("update plans set limits = limits || '{\"max_customers\": 50}' where code = 'free'");
      }
    });

    it("enforces storage_mb on document metadata", async () => {
      await setPlan("business");
      await db.pool.query("update plans set limits = limits || '{\"storage_mb\": 1}' where code = 'business'");
      try {
        const insertDoc = (name: string, size: number) =>
          asUser(db, owner, (s) =>
            s.query(
              "insert into documents (organization_id, storage_path, file_name, mime_type, size_bytes) values ($1, $2, $3, 'application/pdf', $4)",
              [org, `${org}/project/${name}`, name, size],
            ),
          );
        await insertDoc("a.pdf", 700 * 1024);
        await expectPgError(insertDoc("b.pdf", 400 * 1024), "54000");
        await insertDoc("c.pdf", 300 * 1024);
      } finally {
        await db.pool.query("update plans set limits = limits || '{\"storage_mb\": 10240}' where code = 'business'");
      }
    });
  });

  describe("HR documents", () => {
    it("are hidden from roles without team.read, in the table and in Storage", async () => {
      await db.pool.query(
        "insert into documents (organization_id, storage_path, file_name, mime_type, size_bytes, entity_type) values ($1, $2, 'contract.pdf', 'application/pdf', 100, 'employee')",
        [org, `${org}/employee/contract.pdf`],
      );
      await db.pool.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${org}/employee/contract.pdf`]);
      await db.pool.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${org}/project/plan.pdf`]);

      const asEmployee = await asUser(db, employee, async (s) => ({
        docs: (await s.query("select file_name from documents where entity_type = 'employee'")).rows,
        objects: (await s.query("select name from storage.objects where bucket_id = 'documents' order by name")).rows.map((r) => r.name),
      }));
      expect(asEmployee.docs).toEqual([]);
      expect(asEmployee.objects).toEqual([`${org}/project/plan.pdf`]);

      const asOwner = await asUser(db, owner, (s) => s.query("select file_name from documents where entity_type = 'employee'"));
      expect(asOwner.rows).toEqual([{ file_name: "contract.pdf" }]);
    });

    it("require team.manage to upload and must live under the employee folder", async () => {
      await db.pool.query("update organization_members set role = 'manager' where user_id = $1 and organization_id = $2", [employee, org]);
      try {
        // Managers write documents but not HR files.
        await expectPgError(
          asUser(db, employee, (s) => s.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${org}/employee/payroll.pdf`])),
          "42501",
        );
      } finally {
        await db.pool.query("update organization_members set role = 'employee' where user_id = $1 and organization_id = $2", [employee, org]);
      }
      await expectPgError(
        db.pool.query(
          "insert into documents (organization_id, storage_path, file_name, mime_type, size_bytes, entity_type) values ($1, $2, 'x.pdf', 'application/pdf', 1, 'employee')",
          [org, `${org}/project/x.pdf`],
        ),
        "23514",
      );
    });
  });

  describe("admin role is owner-managed", () => {
    it("stops an admin from demoting, suspending or removing another admin", async () => {
      await expectPgError(
        asUser(db, admin, (s) => s.query("update organization_members set role = 'viewer' where user_id = $1 and organization_id = $2", [admin2, org])),
        "42501",
      );
      await expectPgError(
        asUser(db, admin, (s) => s.query("update organization_members set status = 'suspended' where user_id = $1 and organization_id = $2", [admin2, org])),
        "42501",
      );
      await expectPgError(
        asUser(db, admin, (s) => s.query("delete from organization_members where user_id = $1 and organization_id = $2", [admin2, org])),
        "42501",
      );
    });

    it("stops an admin from granting admin, directly or through an invitation", async () => {
      await expectPgError(
        asUser(db, admin, (s) => s.query("update organization_members set role = 'admin' where user_id = $1 and organization_id = $2", [employee, org])),
        "42501",
      );
      await expectPgError(
        asUser(db, admin, (s) =>
          s.query("insert into organization_invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'x@hard.test', 'admin', 'h1', $2)", [org, admin]),
        ),
        "42501",
      );
    });

    it("still lets admins manage lower roles and owners manage admins", async () => {
      await asUser(db, admin, (s) => s.query("update organization_members set role = 'manager' where user_id = $1 and organization_id = $2", [employee, org]));
      await asUser(db, owner, (s) => s.query("update organization_members set role = 'manager' where user_id = $1 and organization_id = $2", [admin2, org]));
      await asUser(db, owner, (s) => s.query("update organization_members set role = 'admin' where user_id = $1 and organization_id = $2", [admin2, org]));
      await asUser(db, admin, (s) => s.query("update organization_members set role = 'employee' where user_id = $1 and organization_id = $2", [employee, org]));
    });

    it("lets an invitee accept an owner-created admin invitation", async () => {
      const invitee = await createUser(db, "new-admin@hard.test");
      const token = randomBytes(32).toString("base64url");
      const hash = createHash("sha256").update(token).digest("hex");
      await asUser(db, owner, (s) =>
        s.query("insert into organization_invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'new-admin@hard.test', 'admin', $2, $3)", [org, hash, owner]),
      );
      await asUser(db, invitee, (s) => s.query("select public.accept_invitation($1)", [token]));
      const { rows } = await db.pool.query("select role from organization_members where user_id = $1 and organization_id = $2", [invitee, org]);
      expect(rows[0].role).toBe("admin");
    });
  });

  describe("regional settings", () => {
    it("are saved atomically and only with settings.manage", async () => {
      await asUser(db, admin, (s) => s.query("select public.update_regional_settings($1, 'RO', 'RON', 'ro', 'Europe/Bucharest')", [org]));
      const { rows } = await db.pool.query(
        "select o.country_code, s.default_currency, s.timezone from organizations o join organization_settings s on s.organization_id = o.id where o.id = $1",
        [org],
      );
      expect(rows[0]).toEqual({ country_code: "RO", default_currency: "RON", timezone: "Europe/Bucharest" });

      await expectPgError(
        asUser(db, employee, (s) => s.query("select public.update_regional_settings($1, 'MD', 'MDL', 'ro', 'Europe/Chisinau')", [org])),
        "42501",
      );
      // An invalid currency rolls back the country change too.
      await expectPgError(
        asUser(db, admin, (s) => s.query("select public.update_regional_settings($1, 'MD', 'XXX', 'ro', 'Europe/Chisinau')", [org])),
        "23503",
      );
      const after = await db.pool.query("select country_code from organizations where id = $1", [org]);
      expect(after.rows[0].country_code).toBe("RO");
    });
  });

  describe("organization soft delete", () => {
    it("is owner-only, needs the slug, and hides the organization from every member", async () => {
      const own = await createUser(db, "deleter@hard.test");
      const member = await createUser(db, "member@hard.test");
      const doomed = await createOrganization(db, own, "Doomed", "doomed-co");
      await addMember(member, "admin", doomed);

      await expectPgError(asUser(db, member, (s) => s.query("select public.delete_organization($1, 'doomed-co')", [doomed])), "42501");
      await expectPgError(asUser(db, own, (s) => s.query("select public.delete_organization($1, 'wrong')", [doomed])), "22023");

      await asUser(db, own, (s) => s.query("select public.delete_organization($1, 'doomed-co')", [doomed]));

      for (const user of [own, member]) {
        const visible = await asUser(db, user, async (s) => ({
          orgs: (await s.query("select id from organizations where id = $1", [doomed])).rowCount,
          settings: (await s.query("select 1 from organization_settings where organization_id = $1", [doomed])).rowCount,
        }));
        expect(visible).toEqual({ orgs: 0, settings: 0 });
      }
      await expectPgError(insertCustomer(own, "After delete", doomed), "42501");
      const sub = await db.pool.query("select status from subscriptions where organization_id = $1", [doomed]);
      expect(sub.rows[0].status).toBe("canceled");
    });
  });
});

import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

describe.skipIf(!available)("organization creation, membership and role enforcement", () => {
  let db: Db;
  let owner: string;
  let admin: string;
  let viewer: string;
  let employee: string;
  let org: string;

  /** Members join through accept_invitation(); tests insert them directly as the superuser for brevity. */
  async function addMember(userId: string, role: string, organizationId = org) {
    await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [organizationId, userId, role]);
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@org.test");
    admin = await createUser(db, "admin@org.test");
    viewer = await createUser(db, "viewer@org.test");
    employee = await createUser(db, "employee@org.test");
    org = await createOrganization(db, owner, "Acme Services", "acme");
    // The free plan allows 2 members; move to Business to test roles (as the billing backend would).
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("creates the owner membership, settings, onboarding state and a trial subscription", async () => {
    await asUser(db, owner, async (s) => {
      const m = await s.query("select role, status from organization_members where organization_id = $1 and user_id = $2", [org, owner]);
      expect(m.rows).toEqual([{ role: "owner", status: "active" }]);
      const st = await s.query("select default_currency, onboarding_step from organization_settings where organization_id = $1", [org]);
      expect(st.rows[0]).toMatchObject({ default_currency: "MDL", onboarding_step: "company" });
      const sub = await s.query("select status from subscriptions where organization_id = $1", [org]);
      expect(sub.rows[0].status).toBe("trialing");
      const p = await s.query("select full_name, email from profiles where id = $1", [owner]);
      expect(p.rows[0]).toMatchObject({ email: "owner@org.test" });
    });
  });

  it("rejects duplicate slugs and unauthenticated creation", async () => {
    const other = await createUser(db, "other@org.test");
    await expectPgError(createOrganization(db, other, "Copy", "acme"), "23505");
    await expectPgError(
      asUser(db, null, (s) => s.query("select public.create_organization('X', 'x-anon', 'MD', 'MDL', 'ro', 'UTC')")),
      "42501",
    );
  });

  it("does not let clients insert memberships directly (only via invitations)", async () => {
    await expectPgError(
      asUser(db, owner, (s) => s.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')", [org, admin])),
      "42501",
    );
  });

  it("enforces role capabilities through RLS", async () => {
    await addMember(admin, "admin");
    await addMember(viewer, "viewer");
    await addMember(employee, "employee");

    // viewer: read-only
    await expectPgError(asUser(db, viewer, (s) => s.query("insert into customers (organization_id, name) values ($1, 'X')", [org])), "42501");
    // employee: no access to finance
    await asUser(db, owner, async (s) => {
      const c = (await s.query("insert into customers (organization_id, name) values ($1, 'Client') returning id", [org])).rows[0].id;
      await s.query("insert into invoices (organization_id, customer_id, currency) values ($1, $2, 'MDL')", [org, c]);
    });
    await asUser(db, employee, async (s) => {
      expect((await s.query("select 1 from invoices where organization_id = $1", [org])).rowCount).toBe(0);
      expect((await s.query("select 1 from customers where organization_id = $1", [org])).rowCount).toBe(1);
    });
    // admin can manage customers
    await asUser(db, admin, (s) => s.query("insert into customers (organization_id, name) values ($1, 'By admin')", [org]));
  });

  it("only owners can grant or change the owner role, and the last owner cannot leave", async () => {
    await expectPgError(
      asUser(db, admin, (s) => s.query("update organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [org, admin])),
      "42501",
    );
    await expectPgError(
      asUser(db, admin, (s) => s.query("update organization_members set role = 'viewer' where organization_id = $1 and user_id = $2", [org, owner])),
      "42501",
    );
    await expectPgError(
      asUser(db, owner, (s) => s.query("update organization_members set status = 'suspended' where organization_id = $1 and user_id = $2", [org, owner])),
      "23514",
    );
    // non-managers cannot change roles at all (RLS filters the row)
    const r = await asUser(db, viewer, (s) =>
      s.query("update organization_members set role = 'admin' where organization_id = $1 and user_id = $2", [org, viewer]),
    );
    expect(r.rowCount).toBe(0);
  });

  it("ignores user-editable metadata for authorization", async () => {
    await db.pool.query(`update auth.users set raw_user_meta_data = '{"role":"owner","organization_id":"${org}"}' where id = $1`, [employee]);
    await asUser(db, employee, async (s) => {
      const allowed = await s.query("select public.has_permission($1, 'invoices.read') as ok", [org]);
      expect(allowed.rows[0].ok).toBe(false);
    });
  });

  it("removes access immediately when a member is suspended", async () => {
    await asUser(db, owner, (s) => s.query("update organization_members set status = 'suspended' where organization_id = $1 and user_id = $2", [org, viewer]));
    await asUser(db, viewer, async (s) => {
      expect((await s.query("select 1 from customers where organization_id = $1", [org])).rowCount).toBe(0);
      expect((await s.query("select 1 from organizations where id = $1", [org])).rowCount).toBe(0);
    });
  });

  it("accepts invitations only for the invited, verified e-mail", async () => {
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await asUser(db, owner, (s) =>
      s.query("insert into organization_invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'new@org.test', 'manager', $2, $3)", [
        org,
        hash,
        owner,
      ]),
    );
    const intruder = await createUser(db, "intruder@org.test");
    await expectPgError(asUser(db, intruder, (s) => s.query("select public.accept_invitation($1)", [token])), "22023");
    const unverified = await createUser(db, "new@org.test", { confirmed: false });
    await expectPgError(asUser(db, unverified, (s) => s.query("select public.accept_invitation($1)", [token])), "42501");
    await db.pool.query("update auth.users set email_confirmed_at = now() where id = $1", [unverified]);
    const joined = await asUser(db, unverified, (s) => s.query("select public.accept_invitation($1) as org", [token]));
    expect(joined.rows[0].org).toBe(org);
    await asUser(db, unverified, async (s) => {
      expect((await s.query("select role from organization_members where organization_id = $1 and user_id = $2", [org, unverified])).rows[0].role).toBe("manager");
    });
    // Tokens are single-use.
    await expectPgError(asUser(db, unverified, (s) => s.query("select public.accept_invitation($1)", [token])), "22023");
  });

  it("cannot invite someone as owner", async () => {
    await expectPgError(
      asUser(db, owner, (s) =>
        s.query("insert into organization_invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'x@org.test', 'owner', 'h', $2)", [
          org,
          owner,
        ]),
      ),
      "23514",
    );
  });

  it("enforces plan limits in the database", async () => {
    const solo = await createUser(db, "solo@org.test");
    const freeOrg = await createOrganization(db, solo, "Free Org", "free-org");
    const second = await createUser(db, "second@org.test");
    const third = await createUser(db, "third@org.test");
    await addMember(second, "viewer", freeOrg);
    await expectPgError(addMember(third, "viewer", freeOrg), "54000");
    await asUser(db, solo, async (s) => {
      for (let i = 0; i < 5; i++) await s.query("insert into projects (organization_id, name, currency) values ($1, $2, 'MDL')", [freeOrg, `P${i}`]);
    });
    await expectPgError(asUser(db, solo, (s) => s.query("insert into projects (organization_id, name, currency) values ($1, 'P6', 'MDL')", [freeOrg])), "54000");
  });
});

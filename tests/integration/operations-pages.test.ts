import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createOrganization, createTestDatabase, createUser, databaseAvailable, dropTestDatabase, expectPgError, type Db } from "./db";

const available = await databaseAvailable();

/**
 * Phase 5: the database rules behind the suppliers, inventory and reports
 * pages, run with the statements the Server Actions and services send.
 */
describe.skipIf(!available)("suppliers, inventory and reports", () => {
  let db: Db;
  let owner: string;
  let manager: string;
  let accountant: string;
  let employee: string;
  let org: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    owner = await createUser(db, "owner@ops.test");
    manager = await createUser(db, "manager@ops.test");
    accountant = await createUser(db, "acc@ops.test");
    employee = await createUser(db, "employee@ops.test");
    org = await createOrganization(db, owner, "Operations Co", "operations-co");
    await db.pool.query("update subscriptions set plan_id = (select id from plans where code = 'business') where organization_id = $1", [org]);
    for (const [user, role] of [
      [manager, "manager"],
      [accountant, "accountant"],
      [employee, "employee"],
    ] as const) {
      await db.pool.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, user, role]);
    }
  });

  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  describe("suppliers", () => {
    const addSupplier = (user: string, name: string) => asUser(db, user, (s) => s.query("insert into suppliers (organization_id, name) values ($1, $2) returning id", [org, name]));

    it("lets managers and accountants add and archive suppliers, while employees only read them", async () => {
      const id = (await addSupplier(accountant, "Supraten SRL")).rows[0].id as string;
      await expectPgError(addSupplier(employee, "Nope SRL"), "42501");
      const seen = await asUser(db, employee, (s) => s.query("select name from suppliers where organization_id = $1 and deleted_at is null", [org]));
      expect(seen.rows).toEqual([{ name: "Supraten SRL" }]);
      expect((await asUser(db, employee, (s) => s.query("update suppliers set deleted_at = now() where id = $1", [id]))).rowCount).toBe(0);
      expect((await asUser(db, manager, (s) => s.query("update suppliers set deleted_at = now() where id = $1", [id]))).rowCount).toBe(1);
    });
  });

  describe("inventory", () => {
    let item: string;
    let warehouse: string;
    const move = (user: string, type: string, quantity: string) =>
      asUser(db, user, (s) =>
        s.query("insert into stock_movements (organization_id, item_id, warehouse_id, movement_type, quantity, occurred_at, created_by) values ($1, $2, $3, $4, $5, now(), $6) returning id", [
          org,
          item,
          warehouse,
          type,
          quantity,
          user,
        ]),
      );

    beforeAll(async () => {
      item = (
        await asUser(db, manager, (s) =>
          s.query("insert into inventory_items (organization_id, name, sku, unit, unit_cost, currency, reorder_level) values ($1, 'Adeziv', 'ADZ-1', 'sac', 89.9, 'MDL', 5) returning id", [org]),
        )
      ).rows[0].id;
      warehouse = (await asUser(db, manager, (s) => s.query("insert into warehouses (organization_id, name, is_default) values ($1, 'Depozit', true) returning id", [org]))).rows[0].id;
    });

    it("keeps SKUs unique and one default warehouse per organization", async () => {
      await expectPgError(asUser(db, manager, (s) => s.query("insert into inventory_items (organization_id, name, sku, unit) values ($1, 'Copie', 'ADZ-1', 'buc')", [org])), "23505");
      await expectPgError(asUser(db, manager, (s) => s.query("insert into warehouses (organization_id, name, is_default) values ($1, 'Al doilea', true)", [org])), "23505");
      await expectPgError(asUser(db, employee, (s) => s.query("insert into inventory_items (organization_id, name, unit) values ($1, 'x', 'buc')", [org])), "42501");
    });

    it("records movements with the right sign and sums them in the stock view", async () => {
      await move(manager, "receipt", "20");
      await move(manager, "issue", "-4.5");
      await move(owner, "adjustment", "-0.5");
      await expectPgError(move(manager, "issue", "3"), "23514");
      await expectPgError(move(manager, "receipt", "-3"), "23514");
      await expectPgError(move(employee, "receipt", "1"), "42501");
      // created_by must be the caller.
      await expectPgError(
        asUser(db, manager, (s) =>
          s.query("insert into stock_movements (organization_id, item_id, warehouse_id, movement_type, quantity, occurred_at, created_by) values ($1, $2, $3, 'receipt', 1, now(), $4)", [org, item, warehouse, owner]),
        ),
        "42501",
      );
      const level = await asUser(db, employee, (s) => s.query("select sum(quantity_on_hand)::text as on_hand from inventory_stock_levels where organization_id = $1 and item_id = $2", [org, item]));
      expect(Number(level.rows[0].on_hand)).toBe(15);
    });
  });

  describe("reports", () => {
    it("returns the requested number of months from dashboard_summary", async () => {
      const { rows } = await asUser(db, accountant, (s) => s.query("select dashboard_summary($1, 3) as s", [org]));
      const summary = rows[0].s;
      const months = summary.monthly;
      expect(months).toHaveLength(3);
    });
  });
});

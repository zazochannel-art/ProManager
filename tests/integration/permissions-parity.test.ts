import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions";
import { createTestDatabase, databaseAvailable, dropTestDatabase, type Db } from "./db";

const available = await databaseAvailable();

describe.skipIf(!available)("permission matrix parity (TypeScript ↔ database)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(async () => {
    if (db) await dropTestDatabase(db);
  });

  it("private.role_permissions equals src/lib/permissions/matrix.ts", async () => {
    const { rows } = await db.pool.query<{ role: string; permission: string }>("select role::text, permission from private.role_permissions");
    const fromDb = rows.map((r) => `${r.permission}:${r.role}`).sort();
    const fromTs = Object.entries(PERMISSIONS)
      .flatMap(([permission, roles]) => roles.map((role) => `${permission}:${role}`))
      .sort();
    expect(fromDb).toEqual(fromTs);
  });
});

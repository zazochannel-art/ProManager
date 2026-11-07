/**
 * Integration-test harness: builds a throw-away PostgreSQL database from the
 * Supabase shim + ALL migrations, then runs queries AS a given user exactly
 * like PostgREST does (SET LOCAL ROLE authenticated + request.jwt.claims), so
 * RLS, column grants, triggers and SECURITY DEFINER functions are exercised
 * for real.
 *
 * Requires a PostgreSQL 15+ server. Configure with TEST_DATABASE_URL
 * (default postgres://postgres:postgres@localhost:5432/postgres). When the
 * server is unreachable the suites are SKIPPED and say so — they never pass
 * silently.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const ROOT = join(import.meta.dirname, "..", "..");

export interface Db {
  pool: pg.Pool;
  name: string;
}

export async function databaseAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Creates a fresh database and applies shim + migrations in order. */
export async function createTestDatabase(): Promise<Db> {
  const name = `pm_it_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });

  const migrationsDir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query(readFileSync(join(ROOT, "tests", "integration", "supabase-shim.sql"), "utf8"));
    for (const file of files) {
      try {
        await client.query(readFileSync(join(migrationsDir, file), "utf8"));
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  return { pool, name };
}

export async function dropTestDatabase(db: Db): Promise<void> {
  await db.pool.end();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${db.name} with (force)`);
  await admin.end();
}

/** Inserts an auth user (as the superuser, like Supabase Auth would). */
export async function createUser(db: Db, email: string, opts: { confirmed?: boolean; fullName?: string } = {}): Promise<string> {
  const id = randomUUID();
  await db.pool.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)`,
    [id, email, opts.confirmed === false ? null : new Date(), JSON.stringify({ full_name: opts.fullName ?? email.split("@")[0] })],
  );
  return id;
}

export interface UserSession {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<pg.QueryResult<T>>;
}

/**
 * Runs `fn` inside a transaction as the given user (role `authenticated`, JWT
 * claims set) — or as `anon` when userId is null. Commits on success so
 * later steps see the data; rolls back and rethrows on error.
 */
export async function asUser<T>(db: Db, userId: string | null, fn: (s: UserSession) => Promise<T>, email?: string): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const claims = userId ? { sub: userId, role: "authenticated", email: email ?? "", aal: "aal1" } : { role: "anon" };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await client.query(userId ? "set local role authenticated" : "set local role anon");
    const result = await fn({ query: (sql, params) => client.query(sql, params as unknown[]) });
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Expects `promise` to reject with the given PostgreSQL SQLSTATE code. */
export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual !== code) throw new Error(`Expected SQLSTATE ${code} but got ${actual}: ${(error as Error).message}`);
    return;
  }
  throw new Error(`Expected SQLSTATE ${code} but the statement succeeded`);
}

/** Creates an organization the way the app does (RPC as the user). */
export async function createOrganization(db: Db, userId: string, name: string, slug: string, currency = "MDL"): Promise<string> {
  return asUser(db, userId, async (s) => {
    const { rows } = await s.query<{ id: string }>(
      "select public.create_organization($1, $2, 'MD', $3, 'ro', 'Europe/Chisinau') as id",
      [name, slug, currency],
    );
    return rows[0]!.id;
  });
}

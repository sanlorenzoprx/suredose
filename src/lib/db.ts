import { z } from "zod";

/**
 * Cloudflare D1 adapter — **server-only**.
 *
 * The binding is `DB` (wrangler.jsonc). Nitro's Cloudflare runtime puts the
 * Worker `env` on `globalThis.__env__` for every request and every cron run,
 * the same way `src/lib/image-store.server.ts` finds the R2 bucket, so the
 * database is looked up per call and never cached across requests.
 *
 *   const rows = await q<{ n: number }>("select count(*) as n from households");
 *   await run("delete from households where id = ?", [code]);
 *   await batch([
 *     stmt("delete from care_medicines where household_id = ?", [code]),
 *     stmt("insert into care_medicines (id, household_id, name) values (?, ?, ?)", [id, code, name]),
 *   ]); // atomic: all statements apply, or none do
 *
 * Schema lives in `migrations/*.sql` and is applied with
 * `wrangler d1 migrations apply` — never create tables from app code.
 *
 * Value conventions (see migrations/0001_init.sql):
 *   - timestamps are ISO-8601 UTC text — pass a `Date` and it is stored as
 *     `toISOString()`; read them back as strings;
 *   - booleans are INTEGER 0/1 — pass `true`/`false` and they are stored as
 *     1/0; convert on read with `fromBool`;
 *   - JSON is TEXT — `JSON.stringify` on write, `parseJson` on read.
 */

/** The slice of the D1 API this app uses (also what the test stand-in implements). */
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

/** A statement waiting to be run, alone or inside `batch()`. */
export interface Stmt {
  sql: string;
  params: unknown[];
}

export function stmt(sql: string, params: unknown[] = []): Stmt {
  return { sql, params };
}

/**
 * The D1 database for this request. Throws a clear error when the binding is
 * missing (for example under `vite dev`, which does not load the Cloudflare
 * runtime — use `npm run cf:dev` for anything that touches the database).
 */
export function getDb(
  env: Record<string, unknown> | undefined = (globalThis as { __env__?: Record<string, unknown> })
    .__env__,
): D1DatabaseLike {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call it from a createServerFn handler or a server route, never from client code.",
    );
  }
  const db = env?.DB as D1DatabaseLike | undefined;
  if (!db || typeof db.prepare !== "function") {
    throw new Error(
      "The D1 database binding `DB` is missing. Deployed, it comes from wrangler.jsonc (d1_databases); " +
        "locally, run the app with `npm run cf:dev` — `vite dev` has no Cloudflare bindings.",
    );
  }
  return db;
}

/** Convert one JavaScript value to something D1 accepts as a bound parameter. */
export function toParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return toIso(value);
  return value;
}

function prepare(db: D1DatabaseLike, { sql, params }: Stmt): D1PreparedStatementLike {
  return db.prepare(sql).bind(...params.map(toParam));
}

/** Run a query and return its rows. */
export async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  db: D1DatabaseLike = getDb(),
): Promise<T[]> {
  const { results } = await prepare(db, { sql, params }).all<T>();
  return results ?? [];
}

/** Run a write that returns no rows; resolves to how many rows it changed. */
export async function run(
  sql: string,
  params: unknown[] = [],
  db: D1DatabaseLike = getDb(),
): Promise<number> {
  const res = await prepare(db, { sql, params }).run();
  return res.meta?.changes ?? 0;
}

/** Run several statements atomically (D1 has no interactive transactions). */
export async function batch(statements: Stmt[], db: D1DatabaseLike = getDb()): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements.map((s) => prepare(db, s)));
}

/** A JSON TEXT column holding a list of strings (care_medicines.times). */
export const stringArraySchema = z.array(z.string());

/** ISO-8601 UTC text, the stored form of every timestamp. */
export function toIso(date: Date = new Date()): string {
  return date.toISOString();
}

/** SQLite 0/1 (or null) to a real boolean. */
export function fromBool(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

/**
 * Parse a JSON TEXT column and validate it. Returns `fallback` when the text is
 * missing, malformed or fails the schema, so one bad row cannot break a list.
 */
export function parseJson<S extends z.ZodTypeAny, F = z.infer<S>>(
  text: unknown,
  schema: S,
  fallback: F,
): z.infer<S> | F {
  if (typeof text !== "string") return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

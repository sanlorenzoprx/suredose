import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { D1DatabaseLike, D1PreparedStatementLike } from "./db.ts";

/**
 * Test stand-in for a D1 database: an in-memory SQLite (node:sqlite) with
 * every file in migrations/ applied, wrapped in the same
 * prepare/bind/all/run/batch shape the app uses. Foreign keys are enforced and
 * `batch()` is atomic (BEGIN/COMMIT, ROLLBACK on error), like D1.
 */
export function createTestD1(): D1DatabaseLike & { raw: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, dir), "utf8"));
  }

  const prepare = (sql: string, values: unknown[] = []): D1PreparedStatementLike => ({
    bind: (...next) => prepare(sql, next),
    async all<T>() {
      const rows = sqlite.prepare(sql).all(...(values as never[]));
      return { results: rows.map((row) => ({ ...row })) as T[] }; // plain objects, like D1
    },
    async run() {
      const res = sqlite.prepare(sql).run(...(values as never[]));
      return { meta: { changes: Number(res.changes) } };
    },
  });

  return {
    raw: sqlite,
    prepare: (sql) => prepare(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const out: unknown[] = [];
        for (const s of statements) out.push(await s.run());
        sqlite.exec("COMMIT");
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

/** Install a fresh database as the Worker `env.DB` for the current test. */
export function installTestDb(): ReturnType<typeof createTestD1> {
  const db = createTestD1();
  (globalThis as { __env__?: Record<string, unknown> }).__env__ = { DB: db };
  return db;
}

import type { Sql } from "./db.ts";

/** Narrow D1 surface; the actual binding also implements Better Auth's native D1 API. */
export interface D1Binding {
  prepare(sql: string): {
    bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> };
  };
  batch(statements: unknown[]): Promise<unknown[]>;
  exec(sql: string): Promise<unknown>;
}

export function getD1Binding(): D1Binding | null {
  const binding = (globalThis as { __env__?: { DB?: D1Binding } }).__env__?.DB;
  return binding && typeof binding.prepare === "function" ? binding : null;
}

export function inWorkerRuntime(): boolean {
  return globalThis.navigator?.userAgent === "Cloudflare-Workers";
}

/** Compile only the small common SQL subset used by this app. Values stay bound.
 * Rate-limit arithmetic and timezone expansion have explicit SQLite implementations.
 * SQL strings/comments are excluded from rewriting; unexpected casts fail closed.
 */
export function compileD1Query(text: string): string {
  return text.split(/('(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\/)/g).map((part, i) => {
    if (i % 2) return part;
    const sql = part
      .replace(/=\s*any\(\s*(\$\d+)(?:::text\[\])?\s*\)/gi,
        "in (select value from json_each($1))")
      .replace(/::(?:jsonb|int(?:eger)?)(?![\w\[])/gi, "")
      .replace(/\bnow\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
      .replace(/\$(\d+)/g, "?$1");
    if (sql.includes("::")) throw new Error("Unsupported PostgreSQL cast on D1");
    return sql;
  }).join("");
}

function parameter(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return Number(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  return value;
}

const booleanColumns = new Set(["verified", "notified", "is_primary", "emailVerified"]);
const jsonColumns = new Set(["times", "result"]);

function normalizeRow<T>(row: T): T {
  const result = { ...row } as Record<string, unknown>;
  for (const [key, value] of Object.entries(result)) {
    if (booleanColumns.has(key) && value !== null) result[key] = Boolean(value);
    if (jsonColumns.has(key) && typeof value === "string") result[key] = JSON.parse(value);
  }
  return result as T;
}

export function createD1Sql(binding: D1Binding): Sql {
  const query = async <T>(text: string, values: unknown[] = []): Promise<T[]> => {
    const result = await binding.prepare(compileD1Query(text)).bind(...values.map(parameter)).all<T>();
    return result.results.map(normalizeRow);
  };
  const sql = (async <T>(parts: TemplateStringsArray, ...values: unknown[]) =>
    query<T>(parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""), values)
  ) as Sql;
  sql.query = query;
  sql.dialect = "sqlite";
  return sql;
}

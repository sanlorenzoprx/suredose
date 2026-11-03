#!/usr/bin/env node
/** Schema-only inspection. Never applies migrations or queries application rows. */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [target = "--local", ...extra] = process.argv.slice(2);
if (!["--local", "--remote"].includes(target) || extra.length) {
  console.error("usage: npm run db:check:d1 -- [--local|--remote] (read-only)");
  process.exit(1);
}
const query = `select m.name as table_name, p.name as column_name, upper(p.type) as type
from sqlite_master m join pragma_table_info(m.name) p
where m.type='table' and m.name not like 'sqlite_%' and m.name not like '_cf_%'`;
const expected = new DatabaseSync(":memory:");
let required;
try {
  for (const file of readdirSync(join(root, "migrations/d1")).filter(f => f.endsWith(".sql")).sort()) {
    expected.exec(readFileSync(join(root, "migrations/d1", file), "utf8"));
  }
  required = expected.prepare(query).all();
} finally { expected.close(); }
const result = spawnSync(process.execPath, [
  join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "DB",
  "--config", join(root, "wrangler.jsonc"), target, "--command", query, "--json",
], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
if (result.error || result.status !== 0) {
  console.error("D1 schema inspection failed. Check D1 read permission for remote access. No database writes attempted.");
  process.exit(1);
}
const payload = JSON.parse(result.stdout);
const actual = payload.flatMap(entry => entry.results ?? []);
const index = new Map(actual.map(row => [`${row.table_name}.${row.column_name}`, row.type]));
const missing = required.filter(row => !index.has(`${row.table_name}.${row.column_name}`))
  .map(row => `${row.table_name}.${row.column_name}`);
const incompatible = required.filter(row => index.has(`${row.table_name}.${row.column_name}`) &&
  index.get(`${row.table_name}.${row.column_name}`) !== row.type)
  .map(row => ({ column: `${row.table_name}.${row.column_name}`, expected: row.type, actual: index.get(`${row.table_name}.${row.column_name}`) }));
const ok = !missing.length && !incompatible.length;
console.log(JSON.stringify({ target, ok, missing, incompatible, readOnly: true,
  note: "Columns/types only. Inspect indexes, constraints and migration history before any remote upgrade; no existing data is changed." }, null, 2));
process.exitCode = ok ? 0 : 1;

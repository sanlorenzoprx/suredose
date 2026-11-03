import type { Sql } from "./db.ts";

export const VISION_RATE_LIMIT_MESSAGE =
  "Too many photo checks — please wait a few minutes and try again, or type the medicine name.";

type Env = Record<string, string | undefined>;
type RateLimitSql = Pick<Sql, "query" | "dialect">;

type Dependencies = {
  getSql?: () => Promise<RateLimitSql>;
  env?: Env;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : fallback;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function callerIp(headers: Headers): string {
  const cloudflareIp = headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const forwardedIp = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwardedIp || "unknown";
}

async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumeVisionCheck(
  headers: Headers,
  dependencies: Dependencies = {},
): Promise<boolean> {
  const env = dependencies.env ?? (typeof process !== "undefined" ? process.env : {});
  const capacity = positiveInteger(env.VISION_RATE_LIMIT, 3);
  const refillMinutes = positiveNumber(env.VISION_RATE_REFILL_MINUTES, 3);
  const ipHash = await hashIp(callerIp(headers));
  const sql = dependencies.getSql
    ? await dependencies.getSql()
    : await (await import("./db.ts")).getSql();

  if (sql.dialect === "sqlite") {
    // One atomic SQLite UPSERT, including refill bookkeeping. No read/write race.
    const intervals = `cast(max(0, (julianday('now') - julianday(current_bucket.window_start)) * 86400) / ($3 * 60) as integer)`;
    const available = `min($2, max(current_bucket.count, 0) + ${intervals})`;
    const rows = await sql.query<{ count: number }>(
      `insert into vision_rate_limits as current_bucket (ip_hash, window_start, count)
       values ($1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), $2 - 1)
       on conflict (ip_hash) do update set
         count = case when ${available} >= 1 then ${available} - 1 else -1 end,
         window_start = strftime('%Y-%m-%dT%H:%M:%fZ', julianday(current_bucket.window_start) + ${intervals} * $3 / 1440.0)
       returning count`,
      [ipHash, capacity, refillMinutes],
    );
    if (!rows[0]) throw new Error("Vision rate-limit query returned no counter row.");
    return rows[0].count >= 0;
  }

  // `count` stores remaining tokens; -1 marks a blocked attempt so RETURNING
  // can distinguish it from a successful use of the final token.
  const rows = await sql.query<{ count: number }>(
    `insert into vision_rate_limits as current_bucket (ip_hash, window_start, count)
     values ($1, now(), $2 - 1)
     on conflict (ip_hash) do update set
       count = case
         when least(
           $2::integer,
           greatest(current_bucket.count, 0) +
             floor(greatest(
               0,
               extract(epoch from (now() - current_bucket.window_start)) /
                 ($3::double precision * 60)
             ))
         ) >= 1
         then (
           least(
             $2::integer,
             greatest(current_bucket.count, 0) +
               floor(greatest(
                 0,
                 extract(epoch from (now() - current_bucket.window_start)) /
                   ($3::double precision * 60)
               ))
           ) - 1
         )::integer
         else -1
       end,
       window_start = current_bucket.window_start +
         (
           floor(greatest(
             0,
             extract(epoch from (now() - current_bucket.window_start)) /
               ($3::double precision * 60)
           )) * ($3::double precision * interval '1 minute')
         )
     returning count`,
    [ipHash, capacity, refillMinutes],
  );

  if (!rows[0]) throw new Error("Vision rate-limit query returned no counter row.");
  return rows[0].count >= 0;
}

export async function withVisionRateLimit<T, B>(
  headers: Headers,
  run: () => Promise<T>,
  blockedResponse: B,
  dependencies?: Dependencies,
): Promise<T | B> {
  if (!(await consumeVisionCheck(headers, dependencies))) return blockedResponse;
  return run();
}

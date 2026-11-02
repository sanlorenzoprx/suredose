import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Sql } from "./db.ts";
import {
  consumeVisionCheck,
  VISION_RATE_LIMIT_MESSAGE,
  withVisionRateLimit,
} from "./vision-rate-limit.ts";

type Counter = { count: number; windowStart: number };

function mockDatabase(now: () => number) {
  const counters = new Map<string, Counter>();
  const db: Pick<Sql, "query"> = {
    async query<T>(query: string, params: unknown[] = []): Promise<T[]> {
      assert.match(query, /insert into vision_rate_limits/i);
      const [ipHash, capacity, refillMinutes] = params as [string, number, number];
      let counter = counters.get(ipHash);
      if (!counter) {
        counter = { count: capacity - 1, windowStart: now() };
        counters.set(ipHash, counter);
        return [{ count: counter.count } as T];
      }

      const intervals = Math.floor(
        Math.max(0, now() - counter.windowStart) / (refillMinutes * 60_000),
      );
      const available = Math.min(capacity, Math.max(counter.count, 0) + intervals);
      counter.windowStart += intervals * refillMinutes * 60_000;
      counter.count = available >= 1 ? available - 1 : -1;
      return [{ count: counter.count } as T];
    },
  };
  return { db, counters };
}

function rateLimitDependencies(db: Pick<Sql, "query">) {
  return {
    getSql: async () => db,
    env: { VISION_RATE_LIMIT: "3", VISION_RATE_REFILL_MINUTES: "3" },
  };
}

const hashed = (ip: string) => createHash("sha256").update(ip).digest("hex");

test("three rapid photo checks pass and a fourth is blocked before vision runs", async () => {
  let now = 0;
  const { db } = mockDatabase(() => now);
  const dependencies = rateLimitDependencies(db);
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.8" });
  let visionCalls = 0;

  for (let i = 0; i < 3; i += 1) {
    const result = await withVisionRateLimit(
      headers,
      async () => {
        visionCalls += 1;
        return { ok: true as const };
      },
      { ok: false as const, error: VISION_RATE_LIMIT_MESSAGE },
      dependencies,
    );
    assert.deepEqual(result, { ok: true });
  }

  const blocked = await withVisionRateLimit(
    headers,
    async () => {
      visionCalls += 1;
      return { ok: true as const };
    },
    { ok: false as const, error: VISION_RATE_LIMIT_MESSAGE },
    dependencies,
  );
  assert.deepEqual(blocked, { ok: false, error: VISION_RATE_LIMIT_MESSAGE });
  assert.equal(visionCalls, 3);
  assert.equal(now, 0);
});

test("a different IP has a separate token bucket", async () => {
  const { db, counters } = mockDatabase(() => 0);
  const dependencies = rateLimitDependencies(db);
  const firstIp = new Headers({ "cf-connecting-ip": "203.0.113.8" });
  const secondIp = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });

  for (let i = 0; i < 3; i += 1)
    assert.equal(await consumeVisionCheck(firstIp, dependencies), true);
  assert.equal(await consumeVisionCheck(firstIp, dependencies), false);
  assert.equal(await consumeVisionCheck(secondIp, dependencies), true);
  assert.deepEqual(
    [...counters.keys()].sort(),
    [hashed("203.0.113.8"), hashed("203.0.113.9")].sort(),
  );
});

test("an IP receives one token after the configured refill interval", async () => {
  let now = 0;
  const { db } = mockDatabase(() => now);
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.8" });
  const dependencies = rateLimitDependencies(db);

  for (let i = 0; i < 3; i += 1)
    assert.equal(await consumeVisionCheck(headers, dependencies), true);
  assert.equal(await consumeVisionCheck(headers, dependencies), false);
  now += 3 * 60_000;
  assert.equal(await consumeVisionCheck(headers, dependencies), true);
  assert.equal(await consumeVisionCheck(headers, dependencies), false);
});

test("manual photo checks spaced by the refill interval continue indefinitely", async () => {
  let now = 0;
  const { db } = mockDatabase(() => now);
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.8" });
  const dependencies = rateLimitDependencies(db);

  for (let i = 0; i < 8; i += 1) {
    if (i > 0) now += 3 * 60_000;
    assert.equal(await consumeVisionCheck(headers, dependencies), true);
  }
});

test("a blocked response has no drug name and causes no check or dose mutation", async () => {
  const { db } = mockDatabase(() => 0);
  const dependencies = rateLimitDependencies(db);
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.8" });
  let visionCalls = 0;
  let openFdaCalls = 0;
  let doseMutations = 0;
  const operation = async () => {
    visionCalls += 1;
    openFdaCalls += 1;
    doseMutations += 1;
    return { ok: true as const, drugName: "Invented medicine" };
  };
  const denied = {
    ok: false as const,
    error: VISION_RATE_LIMIT_MESSAGE,
  };

  for (let i = 0; i < 3; i += 1) {
    await withVisionRateLimit(headers, operation, denied, dependencies);
  }
  const mutationsBeforeBlockedRequest = doseMutations;
  const response = await withVisionRateLimit(headers, operation, denied, dependencies);

  assert.deepEqual(response, denied);
  assert.doesNotMatch(JSON.stringify(response), /drugName|Invented medicine/);
  assert.equal(visionCalls, 3);
  assert.equal(openFdaCalls, 3);
  assert.equal(doseMutations, mutationsBeforeBlockedRequest);
});

test("missing and invalid configuration use safe defaults", async () => {
  let now = 0;
  const { db } = mockDatabase(() => now);
  const dependencies = {
    getSql: async () => db,
    env: { VISION_RATE_LIMIT: "invalid", VISION_RATE_REFILL_MINUTES: "0" },
  };
  const headers = new Headers();

  for (let i = 0; i < 3; i += 1)
    assert.equal(await consumeVisionCheck(headers, dependencies), true);
  assert.equal(await consumeVisionCheck(headers, dependencies), false);
  now += 3 * 60_000;
  assert.equal(await consumeVisionCheck(headers, dependencies), true);
});

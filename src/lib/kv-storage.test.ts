import assert from "node:assert/strict";
import { test } from "node:test";
import { createResilientStorage, type KvBackend, type LegacyStore } from "./kv-storage.ts";

function memBackend(opts: { failSet?: boolean; failGet?: boolean } = {}) {
  const m = new Map<string, string>();
  const backend: KvBackend = {
    get: async (k) => {
      if (opts.failGet) throw new Error("boom");
      return m.get(k) ?? null;
    },
    set: async (k, v) => {
      if (opts.failSet) throw new Error("quota");
      m.set(k, v);
    },
    remove: async (k) => void m.delete(k),
  };
  return { m, backend };
}

function memLegacy(initial: Record<string, string> = {}, opts: { failSet?: boolean } = {}) {
  const m = new Map(Object.entries(initial));
  const legacy: LegacyStore = {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      if (opts.failSet) {
        const e = new Error("full");
        e.name = "QuotaExceededError";
        throw e;
      }
      m.set(k, v);
    },
    remove: (k) => void m.delete(k),
  };
  return { m, legacy };
}

test("an older localStorage copy is moved to the roomy store once", async () => {
  const p = memBackend();
  const l = memLegacy({ s: '{"a":1}' });
  const storage = createResilientStorage({ primary: p.backend, legacy: l.legacy });
  assert.equal(await storage.getItem("s"), '{"a":1}');
  assert.equal(p.m.get("s"), '{"a":1}');
  assert.equal(l.m.has("s"), false);
  assert.equal(await storage.getItem("s"), '{"a":1}');
});

test("saving writes the roomy store and frees the cramped one", async () => {
  const p = memBackend();
  const l = memLegacy({ s: "old" });
  const storage = createResilientStorage({ primary: p.backend, legacy: l.legacy });
  await storage.setItem("s", "new");
  assert.equal(p.m.get("s"), "new");
  assert.equal(l.m.has("s"), false);
});

test("reads never reject, even when storage is broken", async () => {
  const p = memBackend({ failGet: true });
  const storage = createResilientStorage({ primary: p.backend, legacy: null });
  assert.equal(await storage.getItem("s"), null);
});

test("falls back to localStorage when the roomy store fails, and reports a total failure", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const p = memBackend({ failSet: true });
    const l = memLegacy();
    const errors: string[] = [];
    const storage = createResilientStorage({
      primary: p.backend,
      legacy: l.legacy,
      onSaveError: (e) => errors.push(e.reason),
    });
    await storage.setItem("s", "v");
    assert.equal(l.m.get("s"), "v");
    assert.deepEqual([...errors], []);

    const full = memLegacy({}, { failSet: true });
    const storage2 = createResilientStorage({
      primary: p.backend,
      legacy: full.legacy,
      onSaveError: (e) => errors.push(e.reason),
    });
    await storage2.setItem("s", "v");
    assert.deepEqual([...errors], ["QuotaExceededError"]);
  } finally {
    console.error = quiet;
  }
});

test("a burst of saves ends with the newest value", async () => {
  const written: string[] = [];
  const slow: KvBackend = {
    get: async () => null,
    set: async (_k, v) => {
      await new Promise((r) => setTimeout(r, 5));
      written.push(v);
    },
    remove: async () => {},
  };
  const storage = createResilientStorage({ primary: slow, legacy: null });
  await Promise.all([storage.setItem("s", "1"), storage.setItem("s", "2"), storage.setItem("s", "3")]);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(written.at(-1), "3");
});

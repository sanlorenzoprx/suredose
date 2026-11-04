/*
 * Where the app keeps its saved state (medicines, photos, dose history).
 *
 * localStorage holds only ~5 MB on most phones and the state carries photos as base64
 * text, so saving silently failed once a few photos were stored. IndexedDB holds far
 * more. This wrapper:
 *   - reads/writes IndexedDB, and moves any older localStorage copy across once;
 *   - falls back to localStorage if IndexedDB is unavailable (some private modes);
 *   - never throws or rejects (a rejected read would leave the app waiting forever);
 *   - coalesces rapid writes so a burst of changes writes the latest value once;
 *   - reports a failed save so the app can tell the person instead of losing data.
 */
import type { StateStorage } from "zustand/middleware";

export type KvBackend = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type LegacyStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

export type SaveError = { key: string; reason: string };

export function createResilientStorage(opts: {
  primary: KvBackend | null;
  legacy: LegacyStore | null;
  onSaveError?: (err: SaveError) => void;
  onSaved?: (key: string) => void;
}): StateStorage {
  const { primary, legacy } = opts;
  const pending = new Map<string, string>();
  const writing = new Set<string>();

  function readLegacy(key: string): string | null {
    try {
      return legacy?.get(key) ?? null;
    } catch {
      return null;
    }
  }

  async function writeOnce(key: string, value: string): Promise<void> {
    if (primary) {
      try {
        await primary.set(key, value);
        // The IndexedDB copy is now the source of truth: free the cramped localStorage copy.
        try {
          legacy?.remove(key);
        } catch {
          /* ignore */
        }
        opts.onSaved?.(key);
        return;
      } catch (err) {
        console.error("IndexedDB save failed:", err instanceof Error ? err.message : err);
      }
    }
    try {
      if (!legacy) throw new Error("no storage available");
      legacy.set(key, value);
      opts.onSaved?.(key);
    } catch (err) {
      opts.onSaveError?.({ key, reason: err instanceof Error ? err.name || err.message : "failed" });
    }
  }

  async function flush(key: string): Promise<void> {
    if (writing.has(key)) return; // the running loop will pick up the newest value
    writing.add(key);
    try {
      while (pending.has(key)) {
        const value = pending.get(key) as string;
        pending.delete(key);
        await writeOnce(key, value);
      }
    } finally {
      writing.delete(key);
    }
  }

  return {
    async getItem(key) {
      try {
        if (primary) {
          const value = await primary.get(key);
          if (typeof value === "string") return value;
        }
      } catch (err) {
        console.error("IndexedDB read failed:", err instanceof Error ? err.message : err);
      }
      const old = readLegacy(key);
      if (old !== null && primary) {
        try {
          await primary.set(key, old); // one-time move to the roomy store
          legacy?.remove(key);
        } catch {
          /* keep the legacy copy if the move failed */
        }
      }
      return old;
    },
    setItem(key, value) {
      pending.set(key, value);
      return flush(key);
    },
    async removeItem(key) {
      pending.delete(key);
      try {
        await primary?.remove(key);
      } catch {
        /* ignore */
      }
      try {
        legacy?.remove(key);
      } catch {
        /* ignore */
      }
    },
  };
}

const DB_NAME = "suredose";
const STORE = "kv";

function idbBackend(): KvBackend | null {
  if (typeof indexedDB === "undefined") return null;
  let opening: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        opening = null;
        reject(req.error ?? new Error("IndexedDB open failed"));
      };
      req.onblocked = () => reject(new Error("IndexedDB blocked"));
    }));
  const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  };
  return {
    get: async (key) => {
      const v = await run("readonly", (s) => s.get(key));
      return typeof v === "string" ? v : null;
    },
    set: async (key, value) => {
      await run("readwrite", (s) => s.put(value, key));
    },
    remove: async (key) => {
      await run("readwrite", (s) => s.delete(key));
    },
  };
}

function localLegacy(): LegacyStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
      remove: (k) => localStorage.removeItem(k),
    };
  } catch {
    return null;
  }
}

export const SAVE_ERROR_EVENT = "suredose:save-error";

/** Browser storage for the app, or undefined on the server (nothing to persist there). */
export function browserStorage(): StateStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return createResilientStorage({
    primary: idbBackend(),
    legacy: localLegacy(),
    onSaveError: (e) => window.dispatchEvent(new CustomEvent(SAVE_ERROR_EVENT, { detail: e })),
  });
}

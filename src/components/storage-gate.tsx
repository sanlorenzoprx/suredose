import { useEffect, useState, type ReactNode } from "react";
import { SAVE_ERROR_EVENT } from "@/lib/kv-storage";
import { useAppStore } from "@/lib/store";

/**
 * Holds the app back until saved data has loaded from the phone. Storage is read
 * asynchronously now, and showing screens (or writing) before that could briefly
 * show the welcome screen or overwrite saved medicines with empty defaults.
 */
export function StorageGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    const persist = useAppStore.persist;
    if (!persist || persist.hasHydrated?.()) {
      setReady(true);
    } else {
      const unsub = persist.onFinishHydration?.(() => setReady(true));
      // Storage that never answers must not leave the app blank.
      const timer = window.setTimeout(() => setReady(true), 4000);
      return () => {
        if (typeof unsub === "function") unsub();
        window.clearTimeout(timer);
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    const onError = () => setSaveFailed(true);
    window.addEventListener(SAVE_ERROR_EVENT, onError);
    return () => window.removeEventListener(SAVE_ERROR_EVENT, onError);
  }, []);

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center justify-center bg-bg px-6">
        <p className="text-2xl font-bold text-muted">Loading SureDose…</p>
      </div>
    );
  }

  return (
    <>
      {saveFailed ? (
        <div role="alert" className="bg-danger px-4 py-3 text-center text-lg font-bold text-danger-fg">
          This phone is out of space, so your latest changes and photos could not be saved. Free
          some space, then try again.
        </div>
      ) : null}
      {children}
    </>
  );
}

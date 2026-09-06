import { useEffect, useState } from "react";
import { useAppStore } from "./store";

export function useHydrated() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const persist = useAppStore.persist;
    if (!persist) {
      setReady(true);
      return;
    }
    const finish = () => setReady(true);
    const unsub = persist.onFinishHydration?.(finish);
    if (persist.hasHydrated?.()) finish();
    return typeof unsub === "function" ? unsub : undefined;
  }, []);

  return ready;
}

export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

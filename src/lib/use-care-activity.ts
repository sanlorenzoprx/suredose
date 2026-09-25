import { useEffect, useState } from "react";
import { fetchActivity } from "./care";
import { useAppStore } from "./store";
import type { CareActivityItem, CareMedicineSummary } from "./types";

type CareActivityData = {
  patientName: string;
  activity: CareActivityItem[];
  medicines: CareMedicineSummary[];
};

/** Polls the server for a caregiver's view of the paired household. No-op with an empty code. */
export function useCareActivity(limit = 20) {
  const householdCode = useAppStore((s) => s.settings.householdCode);
  const [data, setData] = useState<CareActivityData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!householdCode) return;
    try {
      const res = await fetchActivity({ data: { code: householdCode, limit } });
      if (!res.ok) {
        setError(res.error);
      } else {
        setError("");
        setData(res);
      }
    } catch {
      setError("Could not load the latest updates. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void reload();
    const interval = setInterval(() => void reload(), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdCode]);

  return { data, error, loading, reload };
}

import { useEffect } from "react";
import { syncMedicines } from "./care";
import { useAppStore } from "./store";

/**
 * Mirrors this phone's medicine list (name/strength/times only, no photos) to
 * the server whenever it changes, but only once this device has created or
 * joined a family code as the patient. The caregiver's device reads this
 * mirror; the missed-dose check also reads it to know when a dose is due.
 * A no-op on a caregiver's device or before any code exists.
 */
export function useCareSync(): void {
  const role = useAppStore((s) => s.settings.role);
  const householdCode = useAppStore((s) => s.settings.householdCode);
  const medicines = useAppStore((s) => s.medicines);

  useEffect(() => {
    if (role !== "patient" || !householdCode) return;
    const payload = medicines.map((m) => ({
      id: m.id,
      name: m.name,
      strength: m.strength,
      times: m.times,
    }));
    void syncMedicines({ data: { code: householdCode, medicines: payload } }).catch(() => {
      /* best effort — local reminders keep working even if this fails */
    });
    // Re-run whenever the medicine list itself changes (add/edit/remove),
    // or once pairing happens for the first time.
  }, [role, householdCode, medicines]);
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DoseEvent, Medicine, Settings } from "./types";
import { eventKey, todayISO } from "./schedule";
import { uid } from "./utils";

type AppState = {
  settings: Settings;
  medicines: Medicine[];
  events: DoseEvent[];
  alarmMutedUntil: number;
  setSettings: (patch: Partial<Settings>) => void;
  addMedicine: (medicine: Omit<Medicine, "id" | "createdAt">) => string;
  updateMedicine: (id: string, patch: Partial<Medicine>) => void;
  removeMedicine: (id: string) => void;
  markTaken: (opts: {
    medicineId: string;
    date: string;
    time: string;
    verified: boolean;
    checkImage?: string;
    notified: boolean;
  }) => void;
  markMissed: (medicineId: string, date: string, time: string) => void;
  markNotified: (medicineId: string, date: string, time: string) => void;
  muteAlarm: (ms: number) => void;
  loadSamples: () => void;
  resetAll: () => void;
  leaveHousehold: () => void;
};

const defaultSettings: Settings = {
  patientName: "",
  caregiverName: "",
  caregiverPhone: "",
  soundOn: true,
  vibrateOn: true,
  speakOn: true,
  onboardingDone: false,
  role: "patient",
  householdCode: "",
};

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sampleSet(): Medicine[] {
  const now = new Date();
  const due = hhmm(now);
  const evening = new Date(now);
  evening.setHours(18, 0, 0, 0);
  const night = new Date(now);
  night.setHours(21, 0, 0, 0);
  const stamp = Date.now();
  return [
    {
      id: "sample_0",
      createdAt: stamp,
      name: "Lisinopril",
      strength: "10 mg",
      instructions: "Take 1 tablet by mouth in the morning.",
      bottleImage: "/samples/bottle-lisinopril.jpg",
      pillImage: "/samples/white-tablet.jpg",
      times: [due],
    },
    {
      id: "sample_1",
      createdAt: stamp + 1,
      name: "Metformin",
      strength: "500 mg",
      instructions: "Take 1 tablet with breakfast and dinner.",
      bottleImage: "",
      pillImage: "/samples/blue-capsule.jpg",
      times: [due, hhmm(evening)],
    },
    {
      id: "sample_2",
      createdAt: stamp + 2,
      name: "Atorvastatin",
      strength: "20 mg",
      instructions: "Take 1 tablet at night.",
      bottleImage: "",
      pillImage: "/samples/peach-tablet.jpg",
      times: [hhmm(night)],
    },
  ];
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      medicines: [],
      events: [],
      alarmMutedUntil: 0,
      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      addMedicine: (medicine) => {
        const id = uid("med");
        set((s) => ({
          medicines: [...s.medicines, { ...medicine, id, createdAt: Date.now() }],
        }));
        return id;
      },
      updateMedicine: (id, patch) =>
        set((s) => ({
          medicines: s.medicines.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeMedicine: (id) =>
        set((s) => ({
          medicines: s.medicines.filter((m) => m.id !== id),
          events: s.events.filter((e) => e.medicineId !== id),
        })),
      markTaken: ({ medicineId, date, time, verified, checkImage, notified }) => {
        const key = eventKey(medicineId, date, time);
        set((s) => {
          const rest = s.events.filter(
            (e) => eventKey(e.medicineId, e.date, e.time) !== key,
          );
          const event: DoseEvent = {
            id: uid("dose"),
            medicineId,
            date,
            time,
            status: "taken",
            takenAt: Date.now(),
            verified,
            checkImage,
            notified,
          };
          return { events: [...rest, event], alarmMutedUntil: 0 };
        });
      },
      markMissed: (medicineId, date, time) => {
        const key = eventKey(medicineId, date, time);
        set((s) => {
          const existing = s.events.find(
            (e) => eventKey(e.medicineId, e.date, e.time) === key,
          );
          if (existing?.status === "taken") return s;
          const rest = s.events.filter(
            (e) => eventKey(e.medicineId, e.date, e.time) !== key,
          );
          return {
            events: [
              ...rest,
              {
                id: existing?.id ?? uid("dose"),
                medicineId,
                date,
                time,
                status: "missed" as const,
                verified: false,
                notified: false,
              },
            ],
          };
        });
      },
      markNotified: (medicineId, date, time) => {
        const key = eventKey(medicineId, date, time);
        set((s) => ({
          events: s.events.map((e) =>
            eventKey(e.medicineId, e.date, e.time) === key ? { ...e, notified: true } : e,
          ),
        }));
      },
      muteAlarm: (ms) => set({ alarmMutedUntil: Date.now() + ms }),
      loadSamples: () => {
        set((s) => {
          if (s.medicines.length > 0) return s;
          return {
            medicines: sampleSet(),
            settings: {
              ...s.settings,
              patientName: s.settings.patientName || "Margaret",
              caregiverName: s.settings.caregiverName || "Alex",
              caregiverPhone: s.settings.caregiverPhone || "5550100",
              onboardingDone: true,
            },
          };
        });
      },
      resetAll: () =>
        set({
          settings: defaultSettings,
          medicines: [],
          events: get().events.filter((e) => e.date !== todayISO()),
          alarmMutedUntil: 0,
        }),
      leaveHousehold: () =>
        set((s) => ({
          settings: { ...s.settings, role: "patient", householdCode: "", onboardingDone: false },
        })),
    }),
    {
      name: "suredose-v1",
      partialize: (s) => ({
        settings: s.settings,
        medicines: s.medicines,
        events: s.events.slice(-200),
      }),
    },
  ),
);

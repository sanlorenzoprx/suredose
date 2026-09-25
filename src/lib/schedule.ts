import type { DoseEvent, DoseSlot, DoseStatus, Medicine } from "./types";

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseTimeOnDate(dateISO: string, time: string): Date {
  const [h, min] = time.split(":").map((n) => Number(n));
  const [y, m, d] = dateISO.split("-").map((n) => Number(n));
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export function formatClock(date = new Date()): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimeLabel(time: string): string {
  const [h, min] = time.split(":").map((n) => Number(n));
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatFriendlyWhen(slot: DoseSlot, now = new Date()): string {
  const t = formatTimeLabel(slot.time);
  const today = todayISO(now);
  if (slot.date === today) {
    if (slot.status === "due") return `Now · ${t}`;
    if (slot.status === "upcoming") return `Today at ${t}`;
    return t;
  }
  return `${slot.date} at ${t}`;
}

export function periodOfDay(time: string): "Morning" | "Noon" | "Evening" | "Night" {
  const hour = Number(time.split(":")[0]);
  if (hour < 11) return "Morning";
  if (hour < 15) return "Noon";
  if (hour < 20) return "Evening";
  return "Night";
}

// Also used by the server-side missed-dose check (server/tasks/care/missed-doses.ts)
// so both sides agree on how "late" counts as "missed".
export const GRACE_MS = 2 * 60 * 60 * 1000;

export function eventKey(medicineId: string, date: string, time: string): string {
  return `${medicineId}|${date}|${time}`;
}

export function buildDaySlots(
  medicines: Medicine[],
  events: DoseEvent[],
  now = new Date(),
): DoseSlot[] {
  const date = todayISO(now);
  const eventMap = new Map(events.map((e) => [eventKey(e.medicineId, e.date, e.time), e]));
  const slots: DoseSlot[] = [];

  for (const medicine of medicines) {
    for (const time of medicine.times) {
      const scheduledAt = parseTimeOnDate(date, time);
      const event = eventMap.get(eventKey(medicine.id, date, time));
      let status: DoseStatus = "upcoming";
      if (event?.status === "taken") status = "taken";
      else if (event?.status === "skipped") status = "missed";
      else if (now.getTime() >= scheduledAt.getTime()) {
        status = now.getTime() - scheduledAt.getTime() > GRACE_MS ? "missed" : "due";
      }
      slots.push({ medicine, date, time, scheduledAt, status, event });
    }
  }

  slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  return slots;
}

export function currentDose(slots: DoseSlot[]): DoseSlot | null {
  return slots.find((s) => s.status === "due") ?? null;
}

export function nextUpcoming(slots: DoseSlot[]): DoseSlot | null {
  return slots.find((s) => s.status === "upcoming") ?? null;
}

export function dueQueue(slots: DoseSlot[]): DoseSlot[] {
  return slots.filter((s) => s.status === "due");
}

export function defaultTimesForCount(count: number): string[] {
  if (count <= 1) return ["08:00"];
  if (count === 2) return ["08:00", "20:00"];
  if (count === 3) return ["08:00", "14:00", "20:00"];
  return ["08:00", "12:00", "18:00", "21:00"];
}

export function periodPreset(period: "Morning" | "Noon" | "Evening" | "Night"): string {
  switch (period) {
    case "Morning":
      return "08:00";
    case "Noon":
      return "12:00";
    case "Evening":
      return "18:00";
    case "Night":
      return "21:00";
  }
}

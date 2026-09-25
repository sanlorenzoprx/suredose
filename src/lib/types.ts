export type DoseStatus = "upcoming" | "due" | "taken" | "missed";

export type Medicine = {
  id: string;
  name: string;
  strength: string;
  instructions: string;
  bottleImage: string;
  pillImage: string;
  times: string[];
  createdAt: number;
};

export type DoseEvent = {
  id: string;
  medicineId: string;
  date: string;
  time: string;
  status: "taken" | "missed" | "skipped";
  takenAt?: number;
  verified: boolean;
  checkImage?: string;
  notified: boolean;
};

export type CareRole = "patient" | "caregiver";

export type Settings = {
  patientName: string;
  caregiverName: string;
  caregiverPhone: string;
  soundOn: boolean;
  vibrateOn: boolean;
  speakOn: boolean;
  onboardingDone: boolean;
  /** Whose phone this is. "patient" takes the pills; "caregiver" watches. */
  role: CareRole;
  /** The shared family pairing code, once created or joined. Empty = not paired. */
  householdCode: string;
};

export type DoseSlot = {
  medicine: Medicine;
  date: string;
  time: string;
  scheduledAt: Date;
  status: DoseStatus;
  event?: DoseEvent;
};

export type BottleRead = {
  name: string;
  strength: string;
  timesPerDay: number;
  times: string[];
  instructions: string;
};

export type PillMatch = {
  match: boolean;
  confidence: number;
  reason: string;
};

/** One row in the caregiver's activity feed — a dose that was taken or missed. */
export type CareActivityItem = {
  id: string;
  medicineName: string;
  strength: string;
  date: string;
  time: string;
  status: "taken" | "missed" | "skipped";
  takenAt: number | null;
  verified: boolean;
  checkImage: string | null;
};

/** A patient's medicine, as mirrored to the server for the caregiver's read-only view. */
export type CareMedicineSummary = {
  id: string;
  name: string;
  strength: string;
  times: string[];
};

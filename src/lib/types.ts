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
  /**
   * How the medicine was checked against official U.S. drug data when it
   * was set up: "ndc" = exact product from the bottle's product code
   * (openFDA + DailyMed), "name" = name and strength found in RxNorm,
   * "none" = could not be checked. Missing on medicines saved before this
   * existed.
   */
  verifiedBy?: "ndc" | "name" | "none";
  /** FDA product code (labeler-product), e.g. "0378-1805". */
  ndc?: string;
  rxcui?: string;
  /** The maker, e.g. "Mylan Pharmaceuticals Inc.". Only known from the NDC. */
  labeler?: string;
  /** Plain words, e.g. "tablet", "extended-release capsule". */
  form?: string;
  /** What the pill looks like: "White round tablet, marked M / 367". */
  appearance?: string;
  /** "official" = the maker's photo from the FDA label; "own" = taken by the patient. */
  pillImageSource?: "official" | "own";
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
  /** NDC printed on the label, as printed ("" when not visible). */
  ndc: string;
  /** The label's own pill description line, e.g. "white round tablet imprinted M 367". */
  pillDescription: string;
};

/** A medicine as confirmed by official U.S. drug data. */
export type VerifiedMedicine = {
  by: "ndc" | "name";
  name: string;
  strength: string;
  form: string;
  /** Only known when checked by NDC. */
  labeler: string;
  ndc: string;
  rxcui: string;
  /** From the FDA label (NDC checks only), "" otherwise. */
  appearance: string;
  /** The maker's pill photo from the FDA label, as a JPEG data URL. */
  officialImage: string | null;
};

export type MedicineCheck =
  | { status: "verified"; medicine: VerifiedMedicine; note?: string }
  | { status: "not_found"; message: string; drugName?: string }
  | { status: "unavailable"; message: string };

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

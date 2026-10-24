import { digitsOnly, formatPhoneDisplay } from "./utils";

export function buildTakenMessage(opts: {
  patientName: string;
  caregiverName: string;
  medicineName: string;
  strength: string;
  timeLabel: string;
}): string {
  const who = opts.patientName.trim() || "Your loved one";
  const med = [opts.medicineName, opts.strength].filter(Boolean).join(" ");
  const hello = opts.caregiverName.trim() ? `Hi ${opts.caregiverName.trim()}, ` : "";
  return `${hello}${who} took ${med} at ${opts.timeLabel}. All good. — SureDose`;
}

/** A family code as the app issues them (letters and digits, 4–12 long), upper-cased; otherwise null. */
export function parseJoinCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}

/** The link a family member taps to open SureDose with the code already filled in. */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/?join=${encodeURIComponent(code)}`;
}

/**
 * The invite text. With an origin it carries a tappable link that opens the
 * join screen with the code filled in; without one (before the page knows its
 * own address) it falls back to the plain code.
 */
export function buildInviteMessage(opts: {
  patientName: string;
  caregiverName: string;
  code: string;
  origin?: string;
}): string {
  const hello = `Hi ${opts.caregiverName.trim() || "there"}, it's ${opts.patientName.trim() || "me"}.`;
  if (opts.origin) {
    return `${hello} Tap this link to get updates when I take my medicine: ${inviteLink(opts.origin, opts.code)} (family code ${opts.code})`;
  }
  return `${hello} Open SureDose and enter this family code to get updates when I take my medicine: ${opts.code}`;
}

export function smsHref(phone: string, body: string): string {
  const digits = digitsOnly(phone);
  const number = digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits;
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}

export function openSms(phone: string, body: string): boolean {
  if (!digitsOnly(phone)) return false;
  const href = smsHref(phone, body);
  window.location.href = href;
  return true;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export { formatPhoneDisplay, digitsOnly };

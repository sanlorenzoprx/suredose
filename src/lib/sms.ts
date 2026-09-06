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

import { i as digitsOnly } from "./store-DGpJ6SjZ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/sms-D_TciV2n.js
function buildTakenMessage(opts) {
	const who = opts.patientName.trim() || "Your loved one";
	const med = [opts.medicineName, opts.strength].filter(Boolean).join(" ");
	return `${opts.caregiverName.trim() ? `Hi ${opts.caregiverName.trim()}, ` : ""}${who} took ${med} at ${opts.timeLabel}. All good. — SureDose`;
}
function smsHref(phone, body) {
	const digits = digitsOnly(phone);
	return `sms:${digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits}?body=${encodeURIComponent(body)}`;
}
function openSms(phone, body) {
	if (!digitsOnly(phone)) return false;
	const href = smsHref(phone, body);
	window.location.href = href;
	return true;
}
async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
//#endregion
export { copyText as n, openSms as r, buildTakenMessage as t };

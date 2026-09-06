//#region node_modules/.nitro/vite/services/ssr/assets/schedule-9vyAbRE2.js
function todayISO(now = /* @__PURE__ */ new Date()) {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function parseTimeOnDate(dateISO, time) {
	const [h, min] = time.split(":").map((n) => Number(n));
	const [y, m, d] = dateISO.split("-").map((n) => Number(n));
	return new Date(y, m - 1, d, h, min, 0, 0);
}
function formatClock(date = /* @__PURE__ */ new Date()) {
	return date.toLocaleTimeString(void 0, {
		hour: "numeric",
		minute: "2-digit"
	});
}
function formatTimeLabel(time) {
	const [h, min] = time.split(":").map((n) => Number(n));
	const d = /* @__PURE__ */ new Date();
	d.setHours(h, min, 0, 0);
	return d.toLocaleTimeString(void 0, {
		hour: "numeric",
		minute: "2-digit"
	});
}
function periodOfDay(time) {
	const hour = Number(time.split(":")[0]);
	if (hour < 11) return "Morning";
	if (hour < 15) return "Noon";
	if (hour < 20) return "Evening";
	return "Night";
}
var GRACE_MS = 72e5;
function eventKey(medicineId, date, time) {
	return `${medicineId}|${date}|${time}`;
}
function buildDaySlots(medicines, events, now = /* @__PURE__ */ new Date()) {
	const date = todayISO(now);
	const eventMap = new Map(events.map((e) => [eventKey(e.medicineId, e.date, e.time), e]));
	const slots = [];
	for (const medicine of medicines) for (const time of medicine.times) {
		const scheduledAt = parseTimeOnDate(date, time);
		const event = eventMap.get(eventKey(medicine.id, date, time));
		let status = "upcoming";
		if (event?.status === "taken") status = "taken";
		else if (event?.status === "skipped") status = "missed";
		else if (now.getTime() >= scheduledAt.getTime()) status = now.getTime() - scheduledAt.getTime() > GRACE_MS ? "missed" : "due";
		slots.push({
			medicine,
			date,
			time,
			scheduledAt,
			status,
			event
		});
	}
	slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
	return slots;
}
function currentDose(slots) {
	return slots.find((s) => s.status === "due") ?? null;
}
function nextUpcoming(slots) {
	return slots.find((s) => s.status === "upcoming") ?? null;
}
function dueQueue(slots) {
	return slots.filter((s) => s.status === "due");
}
function defaultTimesForCount(count) {
	if (count <= 1) return ["08:00"];
	if (count === 2) return ["08:00", "20:00"];
	if (count === 3) return [
		"08:00",
		"14:00",
		"20:00"
	];
	return [
		"08:00",
		"12:00",
		"18:00",
		"21:00"
	];
}
function periodPreset(period) {
	switch (period) {
		case "Morning": return "08:00";
		case "Noon": return "12:00";
		case "Evening": return "18:00";
		case "Night": return "21:00";
	}
}
//#endregion
export { eventKey as a, nextUpcoming as c, todayISO as d, dueQueue as i, periodOfDay as l, currentDose as n, formatClock as o, defaultTimesForCount as r, formatTimeLabel as s, buildDaySlots as t, periodPreset as u };

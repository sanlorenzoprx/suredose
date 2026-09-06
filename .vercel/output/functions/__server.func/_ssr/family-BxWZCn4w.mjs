import { i as __toESM } from "../_runtime.mjs";
import { o as formatClock, s as formatTimeLabel, t as buildDaySlots } from "./schedule-9vyAbRE2.mjs";
import { V as require_react, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { d as Heart, h as Bell, t as Volume2 } from "../_libs/lucide-react.mjs";
import { a as formatPhoneDisplay, i as digitsOnly, n as Button, o as useAppStore, r as cn, t as AppShell } from "./store-DGpJ6SjZ.mjs";
import { n as Label, t as Input } from "./input-xp8eobfA.mjs";
import { t as requestNotifyPermission } from "./alerts-peoabm1f.mjs";
import { n as copyText, r as openSms, t as buildTakenMessage } from "./sms-D_TciV2n.mjs";
import { n as useNow, t as useHydrated } from "./use-hydrated-C7macx2S.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/family-BxWZCn4w.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function FamilyPage() {
	const ready = useHydrated();
	const now = useNow(3e4);
	const settings = useAppStore((s) => s.settings);
	const setSettings = useAppStore((s) => s.setSettings);
	const medicines = useAppStore((s) => s.medicines);
	const events = useAppStore((s) => s.events);
	const slots = buildDaySlots(medicines, events, now);
	const takenToday = events.filter((e) => e.status === "taken").sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0)).slice(0, 8);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Family",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xl text-muted",
			children: "Loading…"
		})
	});
	const takenCount = slots.filter((s) => s.status === "taken").length;
	const allTaken = slots.length > 0 && takenCount === slots.length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Family",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-xl bg-paper p-5 shadow-card",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "flex items-center gap-2 text-lg font-bold text-muted",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heart, { className: "size-5" }),
							"Today for ",
							settings.patientName || "you"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-2 text-3xl font-bold leading-tight",
						children: allTaken ? "Every pill is taken." : takenCount === 0 ? "No pills taken yet today." : `${takenCount} of ${slots.length} pills taken.`
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "flex flex-col gap-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-2xl font-bold",
							children: "Who gets the text"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "patient",
								children: "Your first name"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "patient",
								value: settings.patientName,
								onChange: (e) => setSettings({ patientName: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "caregiver",
								children: "Family member's name"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "caregiver",
								value: settings.caregiverName,
								onChange: (e) => setSettings({ caregiverName: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "phone",
								children: "Their phone number"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "phone",
								type: "tel",
								inputMode: "tel",
								value: settings.caregiverPhone,
								onChange: (e) => setSettings({ caregiverPhone: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-lg text-muted",
							children: ["After a correct pill is taken, your phone opens a text that is already written. Tap Send.", settings.caregiverPhone ? ` Texts go to ${formatPhoneDisplay(settings.caregiverPhone)}.` : ""]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-xl bg-paper p-5 shadow-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "flex items-center gap-2 text-2xl font-bold",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "size-6" }), "Alerts"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
							label: "Play a loud chime",
							on: settings.soundOn,
							onChange: (soundOn) => setSettings({ soundOn })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
							label: "Vibrate the phone",
							on: settings.vibrateOn,
							onChange: (vibrateOn) => setSettings({ vibrateOn })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
							label: "Speak the medicine name",
							on: settings.speakOn,
							onChange: (speakOn) => setSettings({ speakOn })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							size: "lg",
							variant: "secondary",
							className: "mt-4 w-full",
							onClick: () => void requestNotifyPermission(),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-6" }), "Allow phone alerts"]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mb-3 text-2xl font-bold",
					children: "Taken recently"
				}), takenToday.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xl text-muted",
					children: "Nothing taken yet."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-3",
					children: takenToday.map((e) => {
						const med = medicines.find((m) => m.id === e.medicineId);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-lg bg-paper p-4 shadow-card",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xl font-bold",
								children: med?.name ?? "Medicine"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-lg text-muted",
								children: [
									e.takenAt ? formatClock(new Date(e.takenAt)) : formatTimeLabel(e.time),
									e.verified ? " · Checked with photo" : " · Marked taken",
									e.notified ? " · Family texted" : ""
								]
							})]
						}, e.id);
					})
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TestTextButton, {})
			]
		})
	});
}
function ToggleRow({ label, on, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => onChange(!on),
		className: "mt-3 flex min-h-16 w-full items-center justify-between gap-4 rounded-md bg-bg px-4 text-left text-xl font-bold",
		children: [
			label,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				"aria-hidden": "true",
				className: cn("relative h-10 w-16 shrink-0 rounded-full", on ? "bg-primary" : "bg-line"),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("absolute top-1 left-1 size-8 rounded-full bg-paper shadow-card transition-transform duration-150 ease-out", on ? "translate-x-6" : "translate-x-0") })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "sr-only",
				children: on ? "On" : "Off"
			})
		]
	});
}
function TestTextButton() {
	const settings = useAppStore((s) => s.settings);
	const medicines = useAppStore((s) => s.medicines);
	const [note, setNote] = (0, import_react.useState)(null);
	const sample = medicines[0];
	const body = buildTakenMessage({
		patientName: settings.patientName || "Margaret",
		caregiverName: settings.caregiverName,
		medicineName: sample?.name ?? "Lisinopril",
		strength: sample?.strength ?? "10 mg",
		timeLabel: formatClock(/* @__PURE__ */ new Date())
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl bg-paper p-5 shadow-card",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-2xl font-bold",
				children: "Send a test text"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xl text-muted",
				children: "See the exact message your family will get."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-4 rounded-md bg-bg p-4 text-xl leading-snug",
				children: body
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				size: "xl",
				className: "mt-4",
				onClick: async () => {
					const phone = digitsOnly(settings.caregiverPhone);
					if (!phone) {
						setNote("Add a phone number first.");
						return;
					}
					if (!openSms(phone, body)) {
						const copied = await copyText(body);
						setNote(copied ? "Message copied." : "Could not open Messages.");
					} else setNote("Messages is opening. Tap Send.");
				},
				children: "Send test text"
			}),
			note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-lg font-bold",
				children: note
			}) : null
		]
	});
}
//#endregion
export { FamilyPage as component };

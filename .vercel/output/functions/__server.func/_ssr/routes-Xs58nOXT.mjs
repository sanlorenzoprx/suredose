import { i as __toESM } from "../_runtime.mjs";
import { c as nextUpcoming, i as dueQueue, l as periodOfDay, n as currentDose, o as formatClock, s as formatTimeLabel, t as buildDaySlots } from "./schedule-9vyAbRE2.mjs";
import { V as require_react, v as Link, x as require_jsx_runtime, y as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { f as Clock, h as Bell, o as Plus, p as Check, s as Pill, t as Volume2 } from "../_libs/lucide-react.mjs";
import { n as Button, o as useAppStore, r as cn, t as AppShell } from "./store-DGpJ6SjZ.mjs";
import { n as Label, t as Input } from "./input-xp8eobfA.mjs";
import { i as stopDoseAlarm, n as showDoseNotification, r as startDoseAlarm, t as requestNotifyPermission } from "./alerts-peoabm1f.mjs";
import { n as useNow, t as useHydrated } from "./use-hydrated-C7macx2S.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Xs58nOXT.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Home() {
	const ready = useHydrated();
	const now = useNow();
	const navigate = useNavigate();
	const settings = useAppStore((s) => s.settings);
	const medicines = useAppStore((s) => s.medicines);
	const events = useAppStore((s) => s.events);
	const alarmMutedUntil = useAppStore((s) => s.alarmMutedUntil);
	const muteAlarm = useAppStore((s) => s.muteAlarm);
	const loadSamples = useAppStore((s) => s.loadSamples);
	const slots = buildDaySlots(medicines, events, now);
	const due = currentDose(slots);
	const dueList = dueQueue(slots);
	const next = nextUpcoming(slots);
	const takenCount = slots.filter((s) => s.status === "taken").length;
	const alarmLive = Boolean(due) && Date.now() >= alarmMutedUntil;
	(0, import_react.useEffect)(() => {
		if (!due || !alarmLive || !settings.onboardingDone) {
			stopDoseAlarm();
			return;
		}
		const phrase = `It is time to take your ${[due.medicine.name, due.medicine.strength].filter(Boolean).join(" ")}.`;
		startDoseAlarm({
			soundOn: settings.soundOn,
			vibrateOn: settings.vibrateOn,
			speakOn: settings.speakOn,
			phrase
		});
		showDoseNotification("Time for your pill", phrase);
		return () => stopDoseAlarm();
	}, [
		due?.medicine.id,
		due?.time,
		alarmLive,
		settings.soundOn,
		settings.vibrateOn,
		settings.speakOn,
		settings.onboardingDone
	]);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "SureDose",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xl text-muted",
			children: "Loading your pills…"
		})
	});
	if (!settings.onboardingDone) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Welcome",
		hideNav: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Onboarding, {})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-lg font-bold text-muted",
				children: settings.patientName ? `Hello, ${settings.patientName}` : "Hello"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-5xl font-bold tabular-nums leading-none",
				children: formatClock(now)
			})] }),
			due ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-due p-5 text-due-fg shadow-card alert-pulse",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "flex items-center gap-2 text-lg font-bold uppercase tracking-wide",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "size-5" }), "Time for your pill"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex items-center gap-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PillThumb, {
							src: due.medicine.pillImage,
							alt: due.medicine.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-3xl font-bold leading-tight",
								children: due.medicine.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xl opacity-90",
								children: due.medicine.strength
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 text-lg opacity-80",
								children: [
									periodOfDay(due.time),
									" · ",
									formatTimeLabel(due.time)
								]
							})
						] })]
					}),
					due.medicine.instructions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 text-xl leading-snug",
						children: due.medicine.instructions
					}) : null,
					dueList.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-lg opacity-80",
						children: [
							"Then ",
							dueList.length - 1,
							" more after this one."
						]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-5 flex flex-col gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "xl",
							variant: "success",
							onClick: () => navigate({
								to: "/check",
								search: {
									medicineId: due.medicine.id,
									date: due.date,
									time: due.time
								}
							}),
							children: "I have this pill"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "xl",
							variant: "secondary",
							onClick: () => muteAlarm(6e5),
							children: "Remind me in 10 minutes"
						})]
					})
				]
			}) : next ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-paper p-5 shadow-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "flex items-center gap-2 text-lg font-bold text-muted",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "size-5" }), "Next pill"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex items-center gap-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PillThumb, {
							src: next.medicine.pillImage,
							alt: next.medicine.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-3xl font-bold leading-tight",
								children: next.medicine.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xl text-muted",
								children: next.medicine.strength
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 text-2xl font-bold",
								children: [
									periodOfDay(next.time),
									" · ",
									formatTimeLabel(next.time)
								]
							})
						] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 text-xl text-muted",
						children: "We will ring, speak, and vibrate when it is time."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "xl",
						className: "mt-5",
						onClick: () => navigate({
							to: "/check",
							search: {
								medicineId: next.medicine.id,
								date: next.date,
								time: next.time
							}
						}),
						children: "Practice taking this pill"
					})
				]
			}) : medicines.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyMedicines, { onSample: loadSamples }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-success p-5 text-success-fg shadow-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "flex items-center gap-2 text-lg font-bold uppercase tracking-wide",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-5" }), "All done for today"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-3 text-3xl font-bold leading-tight",
						children: "You took every pill on today's list."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-xl opacity-90",
						children: "Your family can rest easy."
					})
				]
			}),
			medicines.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-3 flex items-end justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-2xl font-bold",
						children: "Today"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-lg font-bold text-muted tabular-nums",
						children: [
							takenCount,
							" of ",
							slots.length,
							" taken"
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-3",
					children: slots.map((slot) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center gap-4 rounded-lg bg-paper p-3 shadow-card",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PillThumb, {
								src: slot.medicine.pillImage,
								alt: "",
								size: "sm"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "truncate text-xl font-bold",
									children: slot.medicine.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-lg text-muted",
									children: [
										formatTimeLabel(slot.time),
										" · ",
										slot.medicine.strength
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: slot.status })
						]
					}, `${slot.medicine.id}-${slot.time}`))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/add",
					className: "mt-4 block",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "xl",
						variant: "secondary",
						className: "w-full",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-7" }), "Add a medicine"]
					})
				})
			] }) : null
		]
	}) });
}
function StatusChip({ status }) {
	const item = {
		upcoming: {
			label: "Later",
			className: "bg-bg-warm text-ink"
		},
		due: {
			label: "Now",
			className: "bg-due text-due-fg"
		},
		taken: {
			label: "Taken",
			className: "bg-success text-success-fg"
		},
		missed: {
			label: "Missed",
			className: "bg-danger text-danger-fg"
		}
	}[status];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("rounded-sm px-3 py-2 text-base font-bold", item.className),
		children: item.label
	});
}
function PillThumb({ src, alt, size = "md" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("overflow-hidden rounded-md bg-bg-warm", size === "sm" ? "size-16" : "size-24"),
		children: src ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src,
			alt,
			className: "size-full object-cover"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex size-full items-center justify-center text-muted",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pill, { className: "size-8" })
		})
	});
}
function EmptyMedicines({ onSample }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl bg-paper p-5 shadow-card",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pill, { className: "size-10 text-primary" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-3 text-3xl font-bold leading-tight",
				children: "Add your first medicine"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-xl text-muted",
				children: "Take a picture of the bottle. Then take a picture of the pill. We will set the times and remember what it looks like."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/add",
				className: "mt-5 block",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					size: "xl",
					className: "w-full",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-7" }), "Add a medicine"]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				size: "xl",
				variant: "secondary",
				className: "mt-3",
				onClick: onSample,
				children: "Try a sample day"
			})
		]
	});
}
function Onboarding() {
	const setSettings = useAppStore((s) => s.setSettings);
	const loadSamples = useAppStore((s) => s.loadSamples);
	const settings = useAppStore((s) => s.settings);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
		className: "flex flex-col gap-6",
		onSubmit: (e) => {
			e.preventDefault();
			setSettings({ onboardingDone: true });
			requestNotifyPermission();
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-2xl leading-snug text-muted",
				children: "This app helps you take the right pill at the right time. Then it texts someone you love."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: "patient",
					children: "Your first name"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					id: "patient",
					autoComplete: "given-name",
					value: settings.patientName,
					onChange: (e) => setSettings({ patientName: e.target.value }),
					placeholder: "For example, Margaret"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
					htmlFor: "caregiver",
					children: "Family member's first name"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					id: "caregiver",
					value: settings.caregiverName,
					onChange: (e) => setSettings({ caregiverName: e.target.value }),
					placeholder: "For example, Alex"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
						htmlFor: "phone",
						children: "Their phone number"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						id: "phone",
						type: "tel",
						inputMode: "tel",
						autoComplete: "tel",
						value: settings.caregiverPhone,
						onChange: (e) => setSettings({ caregiverPhone: e.target.value }),
						placeholder: "555-010-1234"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-lg text-muted",
						children: "We will open a text to this number after you take a pill."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-lg bg-paper p-4 shadow-card",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "flex items-center gap-2 text-xl font-bold",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-6" }), "Alerts stay on"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-lg text-muted",
					children: "When it is time, the phone will speak the medicine name, play a chime, and vibrate."
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "submit",
				size: "xl",
				children: "I am ready"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				size: "xl",
				variant: "secondary",
				onClick: () => {
					loadSamples();
					requestNotifyPermission();
				},
				children: "Show me a sample day"
			})
		]
	});
}
//#endregion
export { Home as component };

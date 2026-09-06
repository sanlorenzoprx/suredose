import "../_runtime.mjs";
import { a as eventKey, d as todayISO } from "./schedule-9vyAbRE2.mjs";
import { V as require_react, d as useRouterState, v as Link, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { d as Heart, s as Pill, u as House } from "../_libs/lucide-react.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
require_react();
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function uid(prefix = "id") {
	return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
function formatPhoneDisplay(phone) {
	const digits = phone.replace(/\D/g, "");
	if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
	return phone.trim();
}
function digitsOnly(phone) {
	return phone.replace(/\D/g, "");
}
var NAV = [
	{
		to: "/",
		label: "Home",
		icon: House
	},
	{
		to: "/medicines",
		label: "Pills",
		icon: Pill
	},
	{
		to: "/family",
		label: "Family",
		icon: Heart
	}
];
function AppShell({ children, title, hideNav = false }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto flex min-h-dvh max-w-lg flex-col bg-bg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "sticky top-0 z-20 border-b border-line bg-bg/95 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm font-bold tracking-[0.18em] text-primary uppercase",
					children: "SureDose"
				}), title ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-1 text-3xl font-bold leading-tight",
					children: title
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: cn("flex-1 px-5 py-5", hideNav ? "pb-8" : "pb-32"),
				children
			}),
			hideNav ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur-sm",
				style: { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" },
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mx-auto grid max-w-lg grid-cols-3",
					children: NAV.map((item) => {
						const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
						const Icon = item.icon;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: item.to,
							className: cn("flex min-h-20 flex-col items-center justify-center gap-1 text-lg font-bold", active ? "text-primary" : "text-muted"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								className: "size-7",
								strokeWidth: active ? 2.4 : 2
							}), item.label]
						}) }, item.to);
					})
				})
			})
		]
	});
}
var buttonVariants = cva("inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-lg font-bold transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none select-none text-center", {
	variants: {
		variant: {
			primary: "bg-primary text-primary-fg shadow-card hover:bg-primary-hover",
			secondary: "bg-paper text-ink shadow-card hover:bg-bg-warm",
			danger: "bg-danger text-danger-fg shadow-card",
			success: "bg-success text-success-fg shadow-card",
			ghost: "bg-transparent text-ink hover:bg-bg-warm",
			due: "bg-due text-due-fg shadow-card alert-pulse"
		},
		size: {
			md: "min-h-14 px-5 text-xl",
			lg: "min-h-16 px-6 text-xl",
			xl: "min-h-20 w-full px-6 text-2xl",
			icon: "size-14"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "lg"
	}
});
function Button({ className, variant, size, type = "button", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type,
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
var defaultSettings = {
	patientName: "",
	caregiverName: "",
	caregiverPhone: "",
	soundOn: true,
	vibrateOn: true,
	speakOn: true,
	onboardingDone: false
};
function hhmm(date) {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function sampleSet() {
	const now = /* @__PURE__ */ new Date();
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
			times: [due]
		},
		{
			id: "sample_1",
			createdAt: stamp + 1,
			name: "Metformin",
			strength: "500 mg",
			instructions: "Take 1 tablet with breakfast and dinner.",
			bottleImage: "",
			pillImage: "/samples/blue-capsule.jpg",
			times: [due, hhmm(evening)]
		},
		{
			id: "sample_2",
			createdAt: stamp + 2,
			name: "Atorvastatin",
			strength: "20 mg",
			instructions: "Take 1 tablet at night.",
			bottleImage: "",
			pillImage: "/samples/peach-tablet.jpg",
			times: [hhmm(night)]
		}
	];
}
var useAppStore = create()(persist((set, get) => ({
	settings: defaultSettings,
	medicines: [],
	events: [],
	alarmMutedUntil: 0,
	setSettings: (patch) => set((s) => ({ settings: {
		...s.settings,
		...patch
	} })),
	addMedicine: (medicine) => {
		const id = uid("med");
		set((s) => ({ medicines: [...s.medicines, {
			...medicine,
			id,
			createdAt: Date.now()
		}] }));
		return id;
	},
	updateMedicine: (id, patch) => set((s) => ({ medicines: s.medicines.map((m) => m.id === id ? {
		...m,
		...patch
	} : m) })),
	removeMedicine: (id) => set((s) => ({
		medicines: s.medicines.filter((m) => m.id !== id),
		events: s.events.filter((e) => e.medicineId !== id)
	})),
	markTaken: ({ medicineId, date, time, verified, checkImage, notified }) => {
		const key = eventKey(medicineId, date, time);
		set((s) => {
			const rest = s.events.filter((e) => eventKey(e.medicineId, e.date, e.time) !== key);
			const event = {
				id: uid("dose"),
				medicineId,
				date,
				time,
				status: "taken",
				takenAt: Date.now(),
				verified,
				checkImage,
				notified
			};
			return {
				events: [...rest, event],
				alarmMutedUntil: 0
			};
		});
	},
	markMissed: (medicineId, date, time) => {
		const key = eventKey(medicineId, date, time);
		set((s) => {
			const existing = s.events.find((e) => eventKey(e.medicineId, e.date, e.time) === key);
			if (existing?.status === "taken") return s;
			return { events: [...s.events.filter((e) => eventKey(e.medicineId, e.date, e.time) !== key), {
				id: existing?.id ?? uid("dose"),
				medicineId,
				date,
				time,
				status: "missed",
				verified: false,
				notified: false
			}] };
		});
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
					onboardingDone: true
				}
			};
		});
	},
	resetAll: () => set({
		settings: defaultSettings,
		medicines: [],
		events: get().events.filter((e) => e.date !== todayISO()),
		alarmMutedUntil: 0
	})
}), {
	name: "suredose-v1",
	partialize: (s) => ({
		settings: s.settings,
		medicines: s.medicines,
		events: s.events.slice(-200)
	})
}));
//#endregion
export { formatPhoneDisplay as a, digitsOnly as i, Button as n, useAppStore as o, cn as r, AppShell as t };

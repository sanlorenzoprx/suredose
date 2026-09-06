import { i as __toESM } from "../_runtime.mjs";
import { s as formatTimeLabel, u as periodPreset } from "./schedule-9vyAbRE2.mjs";
import { V as require_react, x as require_jsx_runtime, y as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { c as LoaderCircle, g as ArrowLeft, p as Check } from "../_libs/lucide-react.mjs";
import { n as Button, o as useAppStore, r as cn, t as AppShell } from "./store-DGpJ6SjZ.mjs";
import { i as toDataUrl, r as readBottleLabel, t as PhotoCapture } from "./ai-DESyEYFU.mjs";
import { n as Label, t as Input } from "./input-xp8eobfA.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/add-tPn91Obv.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var PERIODS = [
	"Morning",
	"Noon",
	"Evening",
	"Night"
];
function AddMedicine() {
	const navigate = useNavigate();
	const addMedicine = useAppStore((s) => s.addMedicine);
	const [step, setStep] = (0, import_react.useState)(1);
	const [bottleImage, setBottleImage] = (0, import_react.useState)(null);
	const [pillImage, setPillImage] = (0, import_react.useState)(null);
	const [name, setName] = (0, import_react.useState)("");
	const [strength, setStrength] = (0, import_react.useState)("");
	const [instructions, setInstructions] = (0, import_react.useState)("");
	const [times, setTimes] = (0, import_react.useState)(["08:00"]);
	const [reading, setReading] = (0, import_react.useState)(false);
	const [readError, setReadError] = (0, import_react.useState)(null);
	async function onBottle(dataUrl) {
		setBottleImage(dataUrl);
		setReading(true);
		setReadError(null);
		try {
			const result = await readBottleLabel({ data: { image: dataUrl } });
			if (result.ok) {
				if (result.bottle.name) setName(result.bottle.name);
				if (result.bottle.strength) setStrength(result.bottle.strength);
				if (result.bottle.instructions) setInstructions(result.bottle.instructions);
				if (result.bottle.times.length) setTimes(result.bottle.times);
				setStep(2);
			} else {
				setReadError(result.error);
				setStep(2);
			}
		} catch {
			setReadError("Could not read the bottle. Type the name below.");
			setStep(2);
		} finally {
			setReading(false);
		}
	}
	function togglePeriod(period) {
		const t = periodPreset(period);
		setTimes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort());
	}
	function save() {
		if (!name.trim() || !pillImage || times.length === 0) return;
		addMedicine({
			name: name.trim(),
			strength: strength.trim(),
			instructions: instructions.trim(),
			bottleImage: bottleImage ?? "",
			pillImage,
			times
		});
		navigate({ to: "/" });
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		title: "Add a medicine",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mb-5 text-lg font-bold text-muted",
				children: [
					"Step ",
					step,
					" of 3"
				]
			}),
			step === 1 ? reading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center gap-4 py-12 text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-12 animate-spin text-primary" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-2xl font-bold",
						children: "Reading the bottle…"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xl text-muted",
						children: "This takes a few seconds."
					})
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PhotoCapture, {
				title: "Picture of the bottle",
				hint: "Hold the bottle so the label is clear. We will read the name and how often to take it.",
				preview: bottleImage,
				onCapture: (img) => void onBottle(img),
				extraAction: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SampleBottlePicker, { onPick: (src) => void toDataUrl(src).then((d) => onBottle(d)) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "xl",
					variant: "ghost",
					onClick: () => {
						setBottleImage(null);
						setStep(2);
					},
					children: "Skip — I will type it"
				})] })
			}) : null,
			step === 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-3xl font-bold leading-tight",
						children: "Check this is right"
					}),
					readError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xl font-bold text-danger",
						children: readError
					}) : null,
					bottleImage ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: bottleImage,
						alt: "Prescription bottle",
						className: "h-40 w-full rounded-lg object-cover"
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "name",
							children: "Medicine name"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "name",
							value: name,
							onChange: (e) => setName(e.target.value),
							placeholder: "Name on the bottle"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "strength",
							children: "Strength"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "strength",
							value: strength,
							onChange: (e) => setStrength(e.target.value),
							placeholder: "For example, 10 mg"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							htmlFor: "how",
							children: "How to take it"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "how",
							value: instructions,
							onChange: (e) => setInstructions(e.target.value),
							placeholder: "For example, take with food"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-3 text-lg font-bold",
						children: "When do you take it?"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-2 gap-3",
						children: PERIODS.map((period) => {
							const t = periodPreset(period);
							const on = times.includes(t);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => togglePeriod(period),
								className: cn("min-h-20 rounded-lg px-3 text-xl font-bold shadow-card", on ? "bg-primary text-primary-fg" : "bg-paper text-ink"),
								children: [period, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mt-1 block text-lg font-bold opacity-80",
									children: formatTimeLabel(t)
								})]
							}, period);
						})
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "xl",
						disabled: !name.trim() || times.length === 0,
						onClick: () => setStep(3),
						children: "Next: picture of the pill"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "xl",
						variant: "secondary",
						onClick: () => setStep(1),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-6" }), "Back"]
					})
				]
			}) : null,
			step === 3 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PhotoCapture, {
						title: "Picture of the pill",
						hint: "Put one pill on a dark table. We save this so we can check it later.",
						preview: pillImage,
						onCapture: setPillImage,
						extraAction: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SamplePillPicker, { onPick: async (src) => {
							const data = await toDataUrl(src);
							setPillImage(data);
						} })
					}),
					pillImage ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "xl",
						onClick: save,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-7" }), "Save this medicine"]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "xl",
						variant: "secondary",
						onClick: () => setStep(2),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-6" }), "Back"]
					})
				]
			}) : null
		]
	});
}
function SampleBottlePicker({ onPick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => onPick("/samples/bottle-lisinopril.jpg"),
		className: "overflow-hidden rounded-lg bg-paper text-left shadow-card",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src: "/samples/bottle-lisinopril.jpg",
			alt: "Sample prescription bottle",
			className: "h-32 w-full object-cover"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block px-4 py-3 text-xl font-bold",
			children: "Use a sample bottle"
		})]
	});
}
function SamplePillPicker({ onPick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg bg-paper p-4 shadow-card",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mb-3 text-lg font-bold",
			children: "Or use a practice photo"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid grid-cols-3 gap-3",
			children: [
				{
					src: "/samples/white-tablet.jpg",
					label: "White round pill"
				},
				{
					src: "/samples/blue-capsule.jpg",
					label: "Blue and white capsule"
				},
				{
					src: "/samples/peach-tablet.jpg",
					label: "Peach oval pill"
				}
			].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => onPick(s.src),
				className: "overflow-hidden rounded-md",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: s.src,
					alt: s.label,
					className: "aspect-square w-full object-cover"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "sr-only",
					children: s.label
				})]
			}, s.src))
		})]
	});
}
//#endregion
export { AddMedicine as component };

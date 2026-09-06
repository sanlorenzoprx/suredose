import { l as periodOfDay, s as formatTimeLabel } from "./schedule-9vyAbRE2.mjs";
import { v as Link, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { o as Plus, r as Trash2 } from "../_libs/lucide-react.mjs";
import { n as Button, o as useAppStore, t as AppShell } from "./store-DGpJ6SjZ.mjs";
import { t as useHydrated } from "./use-hydrated-C7macx2S.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/medicines-XvyoizZv.js
var import_jsx_runtime = require_jsx_runtime();
function MedicinesPage() {
	const ready = useHydrated();
	const medicines = useAppStore((s) => s.medicines);
	const removeMedicine = useAppStore((s) => s.removeMedicine);
	const loadSamples = useAppStore((s) => s.loadSamples);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Your pills",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xl text-muted",
			children: "Loading…"
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		title: "Your pills",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-5 text-xl text-muted",
				children: "Each pill has a saved photo and the times you take it."
			}),
			medicines.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-paper p-5 shadow-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-2xl font-bold",
						children: "No medicines yet"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-xl text-muted",
						children: "Add one from the bottle and a photo of the pill."
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
						onClick: loadSamples,
						children: "Try a sample day"
					})
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col gap-4",
				children: medicines.map((med) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "rounded-xl bg-paper p-4 shadow-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: med.pillImage,
								alt: med.name,
								className: "size-24 rounded-md object-cover"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "text-2xl font-bold leading-tight",
										children: med.name
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xl text-muted",
										children: med.strength
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-lg",
										children: med.times.map((t) => `${periodOfDay(t)} ${formatTimeLabel(t)}`).join(" · ")
									})
								]
							})]
						}),
						med.instructions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-xl",
							children: med.instructions
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							size: "lg",
							variant: "ghost",
							className: "mt-3 w-full text-danger",
							onClick: () => {
								if (window.confirm(`Remove ${med.name}?`)) removeMedicine(med.id);
							},
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-5" }),
								"Remove ",
								med.name
							]
						})
					]
				}, med.id))
			}),
			medicines.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/add",
				className: "mt-5 block",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					size: "xl",
					className: "w-full",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-7" }), "Add another medicine"]
				})
			}) : null
		]
	});
}
//#endregion
export { MedicinesPage as component };

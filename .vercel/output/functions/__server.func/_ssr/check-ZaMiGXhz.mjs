import { i as __toESM } from "../_runtime.mjs";
import { l as periodOfDay, o as formatClock, s as formatTimeLabel } from "./schedule-9vyAbRE2.mjs";
import { V as require_react, x as require_jsx_runtime, y as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { c as LoaderCircle, i as ShieldAlert, n as TriangleAlert, p as Check } from "../_libs/lucide-react.mjs";
import { i as digitsOnly, n as Button, o as useAppStore, t as AppShell } from "./store-DGpJ6SjZ.mjs";
import { i as toDataUrl, n as comparePills, t as PhotoCapture } from "./ai-DESyEYFU.mjs";
import { n as Route$2 } from "./router-3OQvg7-J.mjs";
import { i as stopDoseAlarm } from "./alerts-peoabm1f.mjs";
import { n as copyText, r as openSms, t as buildTakenMessage } from "./sms-D_TciV2n.mjs";
import { t as useHydrated } from "./use-hydrated-C7macx2S.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/check-ZaMiGXhz.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function CheckDose() {
	const ready = useHydrated();
	const { medicineId, date, time } = Route$2.useSearch();
	const navigate = useNavigate();
	const medicine = useAppStore((s) => s.medicines.find((m) => m.id === medicineId));
	const settings = useAppStore((s) => s.settings);
	const markTaken = useAppStore((s) => s.markTaken);
	const [candidate, setCandidate] = (0, import_react.useState)(null);
	const [checking, setChecking] = (0, import_react.useState)(false);
	const [result, setResult] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [smsNote, setSmsNote] = (0, import_react.useState)(null);
	const message = (0, import_react.useMemo)(() => {
		if (!medicine) return "";
		return buildTakenMessage({
			patientName: settings.patientName,
			caregiverName: settings.caregiverName,
			medicineName: medicine.name,
			strength: medicine.strength,
			timeLabel: formatClock(/* @__PURE__ */ new Date())
		});
	}, [medicine, settings]);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Pill check",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xl text-muted",
			children: "Loading…"
		})
	});
	if (!medicine) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		title: "Pill check",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xl",
			children: "We could not find this medicine."
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			size: "xl",
			className: "mt-4",
			onClick: () => navigate({ to: "/" }),
			children: "Go home"
		})]
	});
	async function runCheck(photo) {
		setCandidate(photo);
		setChecking(true);
		setError(null);
		setResult(null);
		stopDoseAlarm();
		try {
			const reference = await toDataUrl(medicine.pillImage);
			if (reference === photo) {
				setResult({
					match: true,
					confidence: 1,
					reason: "This is the same photo we saved for this pill."
				});
				return;
			}
			const res = await comparePills({ data: {
				reference,
				candidate: photo,
				name: `${medicine.name} ${medicine.strength}`
			} });
			if (res.ok) setResult(res.result);
			else setError(res.error);
		} catch {
			setError("Could not check this photo. Look at both pictures carefully.");
		} finally {
			setChecking(false);
		}
	}
	async function confirmTaken(verified) {
		const phone = digitsOnly(settings.caregiverPhone);
		let notified = false;
		if (phone) {
			notified = openSms(phone, message);
			if (!notified) {
				const copied = await copyText(message);
				setSmsNote(copied ? "Message copied. Paste it into your texting app." : "Could not open Messages. Tell your family you took this pill.");
			} else setSmsNote("Your phone will open Messages. Tap Send.");
		} else setSmsNote("No family number is saved. You can add one under Family.");
		markTaken({
			medicineId: medicine.id,
			date,
			time,
			verified,
			checkImage: candidate ?? void 0,
			notified
		});
		window.setTimeout(() => navigate({ to: "/" }), phone ? 1600 : 700);
	}
	const matchOk = result?.match && result.confidence >= .55;
	const matchBad = result && (!result.match || result.confidence < .45);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Check this pill",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-paper p-4 shadow-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-lg font-bold text-muted",
						children: [
							periodOfDay(time),
							" · ",
							formatTimeLabel(time)
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-1 text-3xl font-bold leading-tight",
						children: medicine.name
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xl text-muted",
						children: medicine.strength
					}),
					medicine.instructions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-xl",
						children: medicine.instructions
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-lg font-bold",
							children: "This is what it looks like"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: medicine.pillImage,
							alt: `Saved photo of ${medicine.name}`,
							className: "aspect-square w-full rounded-lg object-cover"
						})]
					})
				]
			}), checking ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col items-center gap-4 py-8 text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-12 animate-spin text-primary" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-2xl font-bold",
						children: "Checking your pill…"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xl text-muted",
						children: "Hold still. This takes a few seconds."
					}),
					candidate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: candidate,
						alt: "Pill you photographed",
						className: "h-40 rounded-lg object-cover"
					}) : null
				]
			}) : matchOk ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-success p-5 text-success-fg shadow-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "flex items-center gap-2 text-lg font-bold uppercase tracking-wide",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-6" }), "Right pill"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mt-3 text-3xl font-bold leading-tight",
						children: "This is the right pill. You can take it."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xl opacity-90",
						children: result.reason
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "xl",
						variant: "secondary",
						className: "mt-5",
						onClick: () => void confirmTaken(true),
						children: "I took this pill"
					}),
					smsNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-lg",
						children: smsNote
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-lg opacity-80",
						children: [
							"After you tap, we text ",
							settings.caregiverName || "your family",
							"."
						]
					})
				]
			}) : matchBad ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-danger p-5 text-danger-fg shadow-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "flex items-center gap-2 text-lg font-bold uppercase tracking-wide",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "size-6" }), "Stop"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mt-3 text-3xl font-bold leading-tight",
						children: "This is not the right pill. Put it back."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xl",
						children: result.reason
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 grid grid-cols-2 gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: medicine.pillImage,
							alt: "Saved pill",
							className: "aspect-square w-full rounded-md object-cover"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", {
							className: "mt-2 text-center text-lg",
							children: "Saved"
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: candidate ?? "",
							alt: "This pill",
							className: "aspect-square w-full rounded-md object-cover"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", {
							className: "mt-2 text-center text-lg",
							children: "This one"
						})] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "xl",
						variant: "secondary",
						className: "mt-5",
						onClick: () => {
							setResult(null);
							setCandidate(null);
						},
						children: "Try a different pill"
					})
				]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "flex items-start gap-2 text-xl font-bold text-danger",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "mt-1 size-6 shrink-0" }), error]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PhotoCapture, {
					title: "Picture of the pill in your hand",
					hint: "Hold one pill so we can see the color and shape.",
					preview: candidate,
					onCapture: (img) => void runCheck(img),
					extraAction: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "xl",
						variant: "secondary",
						onClick: () => void toDataUrl(medicine.pillImage).then((d) => runCheck(d)),
						children: "Use the saved picture (practice)"
					})
				}),
				result && !matchOk && !matchBad ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-lg bg-paper p-4 shadow-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xl font-bold",
							children: "We are not sure."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-xl text-muted",
							children: result.reason
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-xl",
							children: "Look at both photos. Only take it if they match."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "xl",
							className: "mt-4",
							onClick: () => void confirmTaken(false),
							children: "They match. I took this pill"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "xl",
							variant: "secondary",
							className: "mt-3",
							onClick: () => {
								setResult(null);
								setCandidate(null);
							},
							children: "They do not match"
						})
					]
				}) : null
			] })]
		})
	});
}
//#endregion
export { CheckDose as component };

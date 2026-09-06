import { i as __toESM } from "../_runtime.mjs";
import { V as require_react, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as RefreshCw, l as ImagePlus, m as Camera } from "../_libs/lucide-react.mjs";
import { n as Button } from "./store-DGpJ6SjZ.mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { o as string } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ai-DESyEYFU.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var MAX_EDGE = 720;
var QUALITY = .74;
function compressImage(file, maxEdge = MAX_EDGE, quality = QUALITY) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
			const w = Math.max(1, Math.round(img.width * scale));
			const h = Math.max(1, Math.round(img.height * scale));
			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(/* @__PURE__ */ new Error("Could not read this photo."));
				return;
			}
			ctx.drawImage(img, 0, 0, w, h);
			resolve(canvas.toDataURL("image/jpeg", quality));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(/* @__PURE__ */ new Error("Could not open this photo."));
		};
		img.src = url;
	});
}
async function toDataUrl(src) {
	if (src.startsWith("data:")) return src;
	const res = await fetch(src);
	if (!res.ok) throw new Error("Could not load this photo.");
	return compressImage(await res.blob());
}
function captureFromVideo(video) {
	const canvas = document.createElement("canvas");
	const w = video.videoWidth || 720;
	const h = video.videoHeight || 720;
	const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
	canvas.width = Math.max(1, Math.round(w * scale));
	canvas.height = Math.max(1, Math.round(h * scale));
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not take this photo.");
	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL("image/jpeg", QUALITY);
}
function PhotoCapture({ title, hint, onCapture, preview, extraAction }) {
	const videoRef = (0, import_react.useRef)(null);
	const inputRef = (0, import_react.useRef)(null);
	const streamRef = (0, import_react.useRef)(null);
	const [cameraOn, setCameraOn] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		return () => stopCamera();
	}, []);
	function stopCamera() {
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = null;
		setCameraOn(false);
	}
	async function startCamera() {
		setError(null);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: "environment" },
					width: { ideal: 1280 }
				},
				audio: false
			});
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}
			setCameraOn(true);
		} catch {
			setError("Camera is not available here. Choose a photo from your phone instead.");
			setCameraOn(false);
		}
	}
	function snap() {
		const video = videoRef.current;
		if (!video) return;
		const data = captureFromVideo(video);
		stopCamera();
		onCapture(data);
	}
	async function onFile(file) {
		if (!file) return;
		try {
			onCapture(await compressImage(file));
		} catch {
			setError("Could not open that photo. Try another one.");
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-3xl font-bold leading-tight",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xl text-muted",
				children: hint
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "overflow-hidden rounded-xl bg-ink shadow-card",
				children: cameraOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
					ref: videoRef,
					className: "aspect-square w-full object-cover",
					playsInline: true,
					muted: true,
					autoPlay: true
				}) : preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: preview,
					alt: "Photo you took",
					className: "aspect-square w-full object-cover"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex aspect-square w-full flex-col items-center justify-center gap-3 bg-ink text-due-fg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, {
						className: "size-12",
						strokeWidth: 2
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "px-6 text-center text-xl",
						children: "No photo yet"
					})]
				})
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xl font-bold text-danger",
				children: error
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: inputRef,
				type: "file",
				accept: "image/*",
				capture: "environment",
				className: "sr-only",
				onChange: (e) => {
					onFile(e.target.files?.[0]);
					e.currentTarget.value = "";
				}
			}),
			cameraOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					size: "xl",
					onClick: snap,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "size-7" }), "Take photo"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "xl",
					variant: "secondary",
					onClick: stopCamera,
					children: "Cancel camera"
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "xl",
						onClick: () => void startCamera(),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "size-7" }), "Open camera"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "xl",
						variant: "secondary",
						onClick: () => inputRef.current?.click(),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImagePlus, { className: "size-7" }), "Choose a photo"]
					}),
					preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "xl",
						variant: "ghost",
						onClick: () => inputRef.current?.click(),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "size-6" }), "Use a different photo"]
					}) : null,
					extraAction
				]
			})
		]
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var imageSchema = string().min(20).max(35e5);
var readBottleLabel = createServerFn({ method: "POST" }).validator((input) => ({ image: imageSchema.parse(input.image) })).handler(createSsrRpc("2a722a22c88f1a0e65cefd13d14e3055eaad3e46b4b81a17a7a39c6197f8d443"));
var comparePills = createServerFn({ method: "POST" }).validator((input) => ({
	reference: imageSchema.parse(input.reference),
	candidate: imageSchema.parse(input.candidate),
	name: string().max(80).parse(input.name ?? "")
})).handler(createSsrRpc("63a79891fcb37df693e3223573ca07147bc34e6bd6437df2d821e16f55c76352"));
//#endregion
export { toDataUrl as i, comparePills as n, readBottleLabel as r, PhotoCapture as t };

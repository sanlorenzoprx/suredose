import { i as __toESM } from "../_runtime.mjs";
import { V as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { o as useAppStore } from "./store-DGpJ6SjZ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/use-hydrated-C7macx2S.js
var import_react = /* @__PURE__ */ __toESM(require_react());
function useHydrated() {
	const [ready, setReady] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const persist = useAppStore.persist;
		if (!persist) {
			setReady(true);
			return;
		}
		const finish = () => setReady(true);
		const unsub = persist.onFinishHydration?.(finish);
		if (persist.hasHydrated?.()) finish();
		return typeof unsub === "function" ? unsub : void 0;
	}, []);
	return ready;
}
function useNow(intervalMs = 15e3) {
	const [now, setNow] = (0, import_react.useState)(() => /* @__PURE__ */ new Date());
	(0, import_react.useEffect)(() => {
		const id = window.setInterval(() => setNow(/* @__PURE__ */ new Date()), intervalMs);
		return () => window.clearInterval(id);
	}, [intervalMs]);
	return now;
}
//#endregion
export { useNow as n, useHydrated as t };

import "../_runtime.mjs";
import { V as require_react, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { r as cn } from "./store-DGpJ6SjZ.mjs";
require_react();
var import_jsx_runtime = require_jsx_runtime();
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn("flex min-h-16 w-full rounded-md bg-paper px-4 text-xl text-ink shadow-card", "placeholder:text-muted", "disabled:opacity-50", className),
		...props
	});
}
function Label({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
		className: cn("block text-lg font-bold text-ink", className),
		...props
	});
}
//#endregion
export { Label as n, Input as t };

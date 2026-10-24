// Test-only: lets `node --experimental-strip-types --test` load the app's
// server modules, which use extensionless relative imports, the "@/" alias and
// a few framework packages. Loaded with `--import` by scripts/test.mjs.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);

import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const stubs = new Map([
  ["@tanstack/react-start", new URL("./stub-react-start.mjs", import.meta.url).href],
  ["nitro/task", new URL("./stub-nitro-task.mjs", import.meta.url).href],
]);

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function withExtension(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (isFile(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const stub = stubs.get(specifier);
  if (stub) return { url: stub, shortCircuit: true };

  let base = null;
  if (specifier.startsWith("@/")) base = `${root}src/${specifier.slice(2)}`;
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    base = fileURLToPath(new URL(specifier, context.parentURL));
  }
  if (base && !/\.[cm]?[jt]sx?$/.test(base)) {
    const url = withExtension(base);
    if (url) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

/*
 * Compare Meta Muse and Google Gemini on a folder of real label photos, using the
 * app's own prompt and acceptance rules.
 *
 *   node --experimental-strip-types scripts/vision-eval.ts <photo-folder> [--expected expected.json]
 *
 * Keys come from the environment (never from a file in the repo):
 *   META_API_KEY                          enables Meta Muse
 *   GOOGLE_SERVICE_ACCOUNT_JSON  or  GOOGLE_VERTEX_API_KEY    enables Google
 * Optional: META_VISION_MODEL, VERTEX_MODEL.
 *
 * expected.json (optional) maps a photo file name to what the label really says:
 *   { "bottle1.jpg": { "name": "Metformin", "strength": "500 mg" } }
 * It lets the report separate "unclear" (safe) from "read-WRONG" (dangerous).
 *
 * Results go to eval-results/<timestamp>/ (git-ignored). Use REDACTED photos.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { LABEL_PROMPT, extractJson } from "../src/lib/vision-checks.ts";
import { splitStrengthFromName } from "../src/lib/label-strength.ts";
import { metaConfig, metaVision } from "../src/lib/vision-meta.ts";
import { vertexConfig, vertexVision } from "../src/lib/vertex.ts";
import { unreadableReason } from "../src/lib/vision.ts";
import { classify, compareToExpected, renderReport, type Expected, type Row } from "../src/lib/vision-eval.ts";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const APP_IMAGE_LIMIT = 3_500_000; // same cap the server enforces on a data URL

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const expectedPath = args.includes("--expected") ? args[args.indexOf("--expected") + 1] : undefined;
if (!dir) {
  console.error("Usage: node --experimental-strip-types scripts/vision-eval.ts <photo-folder> [--expected expected.json]");
  process.exit(2);
}

const expected: Record<string, Expected> = expectedPath
  ? JSON.parse(readFileSync(expectedPath, "utf8"))
  : {};
const env = process.env as Record<string, string | undefined>;

const providers: ("meta" | "google")[] = [];
if (metaConfig(env)) providers.push("meta");
else console.warn("META_API_KEY not set: skipping Meta.");
const g = vertexConfig(env);
if (g && !("error" in g)) providers.push("google");
else console.warn("No usable Google credentials: skipping Google.");
if (providers.length === 0) process.exit(2);

const files = readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()]).sort();
if (files.length === 0) {
  console.error(`No .jpg/.png/.webp photos in ${dir}`);
  process.exit(2);
}

const rows: Row[] = [];
for (const file of files) {
  const path = join(dir, file);
  const dataUrl = `data:${MIME[extname(file).toLowerCase()]};base64,${readFileSync(path).toString("base64")}`;
  if (dataUrl.length > APP_IMAGE_LIMIT) {
    console.warn(`${file}: ${(statSync(path).size / 1e6).toFixed(1)} MB is over the app's photo limit; shrink it first.`);
    for (const provider of providers) {
      rows.push({ file, provider, outcome: "skipped", reason: "too-large", name: "", strength: "", ms: 0 });
    }
    continue;
  }
  for (const provider of providers) {
    const started = Date.now();
    const opts = { images: [dataUrl], maxTokens: 500, prompt: LABEL_PROMPT };
    let result;
    try {
      result = provider === "meta" ? await metaVision(opts, env) : await vertexVision(opts, env);
    } catch {
      result = { ok: false as const, error: "request failed" };
    }
    const reason = unreadableReason(result);
    let name = "";
    let strength = "";
    if (result.ok) {
      try {
        const parsed = extractJson(result.text) as { name?: unknown; strength?: unknown };
        const split = splitStrengthFromName(
          typeof parsed.name === "string" ? parsed.name : "",
          typeof parsed.strength === "string" ? parsed.strength : "",
        );
        name = split.name;
        strength = split.strength;
      } catch {
        /* unparseable: leave blank; reason already says so */
      }
    }
    const comparison = compareToExpected({ name, strength }, expected[file]);
    const outcome = classify({ providerOk: result.ok, reason, comparison });
    rows.push({ file, provider, outcome, reason: reason === "ok" ? "ok" : reason.split(" ")[0], name, strength, ms: Date.now() - started });
    console.log(`${file}  ${provider.padEnd(6)}  ${outcome}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join("eval-results", stamp);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "results.json"), JSON.stringify(rows, null, 2));
writeFileSync(join(outDir, "report.md"), renderReport(rows, new Date().toISOString()));
console.log(`\nReport: ${join(outDir, "report.md")}`);

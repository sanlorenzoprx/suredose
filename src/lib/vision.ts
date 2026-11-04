/*
 * The one place that chooses the AI model for photo reading and pill checks.
 *
 * Order: Meta Muse first when META_API_KEY is set, then Google Vertex AI
 * (src/lib/vertex.ts) when Meta is missing, fails, or cannot read the photo.
 *
 *   VISION_PROVIDER unset / "auto"  Meta first if META_API_KEY exists, else Google
 *   VISION_PROVIDER=meta            Meta first, Google fallback
 *   VISION_PROVIDER=google          Google only (never calls Meta)
 *
 * Callers use `vision` and never name a provider. Both providers return the
 * same answer shape, so switching is a configuration change, not a code change.
 */

import { splitStrengthFromName } from "./label-strength.ts";
import { metaVision } from "./vision-meta.ts";
import { vertexVision, type VisionResult } from "./vertex.ts";

type Env = Record<string, string | undefined>;

export type VisionOptions = { prompt: string; images: string[]; maxTokens: number };

export function visionProvider(env: Env): "google" | "meta" {
  const choice = env.VISION_PROVIDER?.trim().toLowerCase();
  if (choice === "google") return "google";
  if (choice === "meta") return "meta";
  return env.META_API_KEY?.trim() ? "meta" : "google";
}

const MANUAL_CHECK_ERROR =
  "We could not check this clearly. Please check the details manually or ask your pharmacist.";

function parseResponse(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasLowConfidenceMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasLowConfidenceMarker);
  if (!isRecord(value)) return false;
  const fields = value;
  if (fields.needs_manual_check === true || fields.readable === false) return true;
  if (typeof fields.confidence === "number" && fields.confidence < 0.5) return true;
  if (
    typeof fields.confidence === "string" &&
    /^(?:very\s+)?(?:low|uncertain|unknown|insufficient)$/i.test(fields.confidence.trim())
  )
    return true;
  if (typeof fields.quality === "string" && fields.quality.toLowerCase() !== "clear") return true;
  if (
    ("name" in fields || "strength" in fields) &&
    ((typeof fields.name === "string" && !fields.name.trim()) ||
      (typeof fields.strength === "string" && !fields.strength.trim()))
  )
    return true;
  return Object.values(fields).some(hasLowConfidenceMarker);
}

/** A bottle label whose strength sits inside the name counts as read (see label-strength.ts). */
function withStrengthSplit(parsed: unknown): unknown {
  if (!isRecord(parsed) || typeof parsed.name !== "string") return parsed;
  if (typeof parsed.strength === "string" && parsed.strength.trim()) return parsed;
  const split = splitStrengthFromName(parsed.name, "");
  return { ...parsed, name: split.name, strength: split.strength };
}

function isUnreadable(result: VisionResult): boolean {
  if (!result.ok) return true;
  const parsed = withStrengthSplit(parseResponse(result.text));
  if (!isRecord(parsed)) return true;

  const fields = parsed;
  if ("quality" in fields || "sides" in fields) {
    if (
      fields.quality !== "clear" ||
      !Array.isArray(fields.sides) ||
      fields.sides.length === 0 ||
      typeof fields.shape !== "string" ||
      !fields.shape.trim() ||
      typeof fields.color !== "string" ||
      !fields.color.trim() ||
      fields.sides.some(
        (side) => !isRecord(side) || side.readable !== true || typeof side.marking !== "string",
      )
    )
      return true;
  } else if (
    "name" in fields ||
    "strength" in fields ||
    "timesPerDay" in fields ||
    "times" in fields
  ) {
    if (
      typeof fields.name !== "string" ||
      !fields.name.trim() ||
      typeof fields.strength !== "string" ||
      !fields.strength.trim()
    )
      return true;
  } else {
    return true;
  }

  return hasLowConfidenceMarker(parsed);
}

/** Field names and lengths only (never the text), to tell "missing" from "blank". */
function describeShape(parsed: Record<string, unknown>): string {
  const len = (v: unknown) =>
    v === undefined ? "missing" : typeof v === "string" ? String(v.trim().length) : typeof v;
  return ` keys=[${Object.keys(parsed).slice(0, 12).join(",")}] nameLen=${len(parsed.name)} strengthLen=${len(parsed.strength)}`;
}

/** Why an answer was rejected — a short category only, never label or photo content. */
function unreadableReason(result: VisionResult): string {
  if (!result.ok) return "provider-error";
  const parsed = parseResponse(result.text);
  if (!isRecord(parsed)) return `no-json textLen=${result.text.length}`;
  const f = parsed;
  const shape = describeShape(parsed);
  if (f.needs_manual_check === true) return `model-said-manual-check${shape}`;
  if ("name" in f || "strength" in f) {
    if (typeof f.name !== "string" || !f.name.trim()) return `name-empty${shape}`;
    if (typeof f.strength !== "string" || !f.strength.trim()) return `strength-empty${shape}`;
  }
  if (hasLowConfidenceMarker(parsed)) return `low-confidence-marker${shape}`;
  return isUnreadable(result) ? `failed-validation${shape}` : "ok";
}

async function callProvider(call: () => Promise<VisionResult>): Promise<VisionResult> {
  try {
    return await call();
  } catch (err) {
    console.error("vision provider failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "AI is not available right now." };
  }
}

export async function vision(
  opts: VisionOptions,
  env: Env = typeof process !== "undefined" ? process.env : {},
): Promise<VisionResult> {
  if (visionProvider(env) === "google") {
    console.log("vision: provider=google (forced or no Meta key)");
    const only = await callProvider(() => vertexVision(opts, env));
    if (!only.ok) console.log("vision: provider=google result=failed reason=provider-error");
    return only;
  }

  const meta = await callProvider(() => metaVision(opts, env));
  if (meta.ok && !isUnreadable(meta)) {
    console.log("vision: provider=meta result=used");
    return meta;
  }

  const metaWasUnreadable = meta.ok;
  console.log(
    `vision: provider=meta result=${metaWasUnreadable ? "unreadable" : "failed"} reason=${unreadableReason(meta)}; trying google`,
  );
  const google = await callProvider(() => vertexVision(opts, env));
  if (!google.ok) {
    console.log("vision: provider=google result=failed reason=provider-error");
    return metaWasUnreadable ? { ok: false, error: MANUAL_CHECK_ERROR } : google;
  }
  if (isUnreadable(google)) {
    console.log(`vision: provider=google result=unreadable reason=${unreadableReason(google)}`);
    return { ok: false, error: MANUAL_CHECK_ERROR };
  }
  console.log("vision: provider=google result=used (fallback)");
  return google;
}

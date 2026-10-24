/*
 * The one place that chooses the AI model for photo reading and pill checks.
 *
 *   VISION_PROVIDER=google  (default) Google Vertex AI — src/lib/vertex.ts
 *   VISION_PROVIDER=meta              Meta Model API   — src/lib/vision-meta.ts
 *
 * Callers use `vision` and never name a provider. Both providers return the
 * same answer shape, so switching is a configuration change, not a code change.
 */

import { metaVision } from "./vision-meta.ts";
import { vertexVision, type VisionResult } from "./vertex.ts";

type Env = Record<string, string | undefined>;

export type VisionOptions = { prompt: string; images: string[]; maxTokens: number };

export function visionProvider(env: Env): "google" | "meta" {
  return env.VISION_PROVIDER?.trim().toLowerCase() === "meta" ? "meta" : "google";
}

export function vision(
  opts: VisionOptions,
  env: Env = typeof process !== "undefined" ? process.env : {},
): Promise<VisionResult> {
  return visionProvider(env) === "meta" ? metaVision(opts, env) : vertexVision(opts, env);
}

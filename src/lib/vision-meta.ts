/*
 * Meta Model API — an alternative to Google Vertex for bottle reading and pill
 * comparison (src/lib/vision.ts chooses between them).
 *
 * Uses the OpenAI-compatible chat completions format at api.meta.ai, with plain
 * `fetch`, so it runs in the Cloudflare Worker like vertex.ts does.
 *
 * Settings:
 *   VISION_PROVIDER=meta     select this provider (default is google)
 *   META_API_KEY             bearer key for the Meta Model API (required)
 *   META_VISION_MODEL        default "muse-spark-1.3"
 *   META_API_BASE_URL        default "https://api.meta.ai/v1"
 *
 * Structured JSON is requested in the prompt, because JSON output mode with
 * images is not documented for this endpoint. The callers parse and validate
 * the JSON, so a bad answer becomes a plain "could not check" message.
 */

import type { VisionResult } from "./vertex.ts";

export const META_DEFAULT_MODEL = "muse-spark-1.3";
export const META_DEFAULT_BASE_URL = "https://api.meta.ai/v1";
const REQUEST_TIMEOUT_MS = 30_000;

type Env = Record<string, string | undefined>;

export type MetaConfig = { apiKey: string; model: string; baseUrl: string };

/** Read the Meta settings; null when no key is configured. */
export function metaConfig(env: Env): MetaConfig | null {
  const apiKey = env.META_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: env.META_VISION_MODEL?.trim() || META_DEFAULT_MODEL,
    baseUrl: (env.META_API_BASE_URL?.trim() || META_DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}

/** Image inputs are base64 data URLs from the photo helpers. Anything else is rejected. */
const DATA_URL = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

export function buildMetaRequest(opts: {
  prompt: string;
  images: string[];
  maxTokens: number;
  model: string;
}): Record<string, unknown> {
  const content: unknown[] = [{ type: "text", text: opts.prompt }];
  for (const img of opts.images) {
    if (!DATA_URL.test(img)) throw new Error("Images must be base64 data URLs");
    content.push({ type: "image_url", image_url: { url: img } });
  }
  return {
    model: opts.model,
    messages: [{ role: "user", content }],
    max_tokens: opts.maxTokens,
  };
}

type ChatCompletionResponse = {
  choices?: { message?: { content?: string | null } }[];
};

export function metaResponseText(json: unknown): { text: string } | { error: string } {
  const body = json as ChatCompletionResponse;
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { error: "empty response" };
  return { text };
}

function userError(status: number): string {
  if (status === 429) return "The photo checker is busy. Please try again in a minute.";
  if (status === 400) return "Could not read this photo. Please try another picture.";
  return "AI is not available right now.";
}

/**
 * Send a prompt plus photos to the Meta Model API and return its text answer.
 * Never throws: failures come back as a plain-English `error`, and the
 * technical reason goes to the server log.
 */
export async function metaVision(
  opts: { prompt: string; images: string[]; maxTokens: number },
  env: Env = typeof process !== "undefined" ? process.env : {},
): Promise<VisionResult> {
  const cfg = metaConfig(env);
  if (!cfg) {
    console.error("meta config: META_API_KEY is not set");
    return { ok: false, error: "AI is not available right now." };
  }
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(buildMetaRequest({ ...opts, model: cfg.model })),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`meta ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { ok: false, error: userError(res.status) };
    }
    const out = metaResponseText(await res.json());
    if ("error" in out) {
      console.error("meta:", out.error);
      return { ok: false, error: "AI did not return a result." };
    }
    return { ok: true, text: out.text };
  } catch (err) {
    console.error("meta request failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "AI is not available right now." };
  }
}

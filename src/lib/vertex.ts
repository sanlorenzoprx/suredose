/*
 * Google Vertex AI (Gemini Enterprise Agent Platform) — the LLM behind
 * bottle reading and pill comparison (src/lib/ai.ts).
 *
 * Plain `fetch` + Web Crypto only, no Google SDK: the app runs as a
 * Cloudflare Worker, where google-auth-library's Node internals don't work.
 * No imports, so it is unit tested with plain Node (vertex.test.ts).
 *
 * Two ways to authenticate (set ONE):
 *   GOOGLE_VERTEX_API_KEY        express-mode API key — simplest
 *   GOOGLE_SERVICE_ACCOUNT_JSON  a service account key file's JSON, pasted
 *                                whole — the usual production setup; needs
 *                                the "Vertex AI User" role
 * Optional:
 *   GOOGLE_CLOUD_PROJECT   defaults to the service account's project_id
 *   GOOGLE_CLOUD_LOCATION  default "global" (best availability, fewer 429s)
 *   VERTEX_MODEL           default "gemini-3.6-flash"
 *   VERTEX_THINKING_LEVEL  default "low" — these are quick extraction tasks
 *                          and an older adult is waiting; "" to leave the
 *                          model's default
 */

export const DEFAULT_MODEL = "gemini-3.6-flash";
export const DEFAULT_LOCATION = "global";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 30_000;
// Gemini 3 models think before answering, and thinking counts against the
// output budget — too small a cap returns an empty answer. The answers
// here are tiny JSON objects, so this is only a safety ceiling.
const MIN_OUTPUT_TOKENS = 4096;

type Env = Record<string, string | undefined>;

export type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

export type VertexConfig =
  | { auth: "apiKey"; apiKey: string; model: string; thinkingLevel: string }
  | {
      auth: "serviceAccount";
      account: ServiceAccount;
      project: string;
      location: string;
      model: string;
      thinkingLevel: string;
    };

/** Read the Vertex settings; null when no credentials are configured. */
export function vertexConfig(env: Env): VertexConfig | { error: string } | null {
  const model = env.VERTEX_MODEL?.trim() || DEFAULT_MODEL;
  const thinkingLevel = (env.VERTEX_THINKING_LEVEL ?? "low").trim().toLowerCase();
  const apiKey = env.GOOGLE_VERTEX_API_KEY?.trim();
  if (apiKey) return { auth: "apiKey", apiKey, model, thinkingLevel };

  const rawAccount = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawAccount) return null;
  let account: ServiceAccount;
  try {
    account = JSON.parse(rawAccount) as ServiceAccount;
  } catch {
    return { error: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON" };
  }
  if (!account.client_email || !account.private_key) {
    return { error: "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key" };
  }
  const project = env.GOOGLE_CLOUD_PROJECT?.trim() || account.project_id || "";
  if (!project) return { error: "Set GOOGLE_CLOUD_PROJECT (the service account has no project_id)" };
  const location = env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_LOCATION;
  return { auth: "serviceAccount", account, project, location, model, thinkingLevel };
}

export function generateContentUrl(cfg: VertexConfig): string {
  const model = encodeURIComponent(cfg.model);
  if (cfg.auth === "apiKey") {
    // Express mode: no project or location in the path; the key decides.
    return `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`;
  }
  const host = cfg.location === "global" ? "aiplatform.googleapis.com" : `${cfg.location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(cfg.project)}/locations/${encodeURIComponent(cfg.location)}/publishers/google/models/${model}:generateContent`;
}

/* ------------------------------------------------------------------ */
/* Request / response                                                  */
/* ------------------------------------------------------------------ */

/** "data:image/jpeg;base64,AAAA" → inline image part. */
export function imagePart(dataUrl: string): { inlineData: { mimeType: string; data: string } } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  return m ? { inlineData: { mimeType: m[1].toLowerCase(), data: m[2] } } : null;
}

export function buildRequest(opts: {
  prompt: string;
  images: string[];
  maxTokens: number;
  thinkingLevel: string;
}): Record<string, unknown> {
  const parts: unknown[] = [{ text: opts.prompt }];
  for (const img of opts.images) {
    const part = imagePart(img);
    if (!part) throw new Error("Images must be base64 data URLs");
    parts.push(part);
  }
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.max(opts.maxTokens, MIN_OUTPUT_TOKENS),
    // Every prompt in ai.ts asks for a JSON object.
    responseMimeType: "application/json",
  };
  if (opts.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel.toUpperCase() };
  return { contents: [{ role: "user", parts }], generationConfig };
}

type GenerateContentResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

/** The answer text, skipping the model's "thought" parts. */
export function responseText(json: unknown): { text: string } | { error: string } {
  const body = json as GenerateContentResponse;
  if (body?.promptFeedback?.blockReason) return { error: `blocked (${body.promptFeedback.blockReason})` };
  const cand = body?.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  if (text) return { text };
  return { error: `empty answer (${cand?.finishReason ?? "no candidates"})` };
}

/* ------------------------------------------------------------------ */
/* Service-account access tokens (OAuth 2 JWT bearer, RS256)           */
/* ------------------------------------------------------------------ */

function base64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/\\n/g, "\n") // a key pasted with literal "\n" sequences
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** A signed JWT asking Google for a cloud-platform access token. */
export async function signServiceAccountJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: account.token_uri || DEFAULT_TOKEN_URI,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(sig))}`;
}

// Per Worker isolate; a token lasts an hour, refreshed 5 minutes early.
const tokenCache = globalThis as typeof globalThis & {
  __vertexToken__?: { email: string; token: string; expiresAt: number };
};

export async function accessToken(account: ServiceAccount): Promise<string> {
  const cached = tokenCache.__vertexToken__;
  if (cached && cached.email === account.client_email && cached.expiresAt - 300_000 > Date.now()) {
    return cached.token;
  }
  const jwt = await signServiceAccountJwt(account, Math.floor(Date.now() / 1000));
  const res = await fetch(account.token_uri || DEFAULT_TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google token request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google token response had no access_token");
  tokenCache.__vertexToken__ = {
    email: account.client_email,
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

/* ------------------------------------------------------------------ */
/* The call                                                            */
/* ------------------------------------------------------------------ */

export type VisionResult = { ok: true; text: string } | { ok: false; error: string };

function userError(status: number): string {
  if (status === 429) return "The photo checker is busy. Please try again in a minute.";
  if (status === 400) return "Could not read this photo. Please try another picture.";
  return "AI is not available right now.";
}

/**
 * Send a prompt plus photos to Gemini and return its text answer.
 * Never throws: failures come back as a plain-English `error`, and the
 * technical reason goes to the server log.
 */
export async function vertexVision(
  opts: { prompt: string; images: string[]; maxTokens: number },
  env: Env = typeof process !== "undefined" ? process.env : {},
): Promise<VisionResult> {
  const cfg = vertexConfig(env);
  if (!cfg) return { ok: false, error: "AI is not available right now." };
  if ("error" in cfg) {
    console.error("vertex config:", cfg.error);
    return { ok: false, error: "AI is not available right now." };
  }

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cfg.auth === "apiKey") headers["x-goog-api-key"] = cfg.apiKey;
    else headers.authorization = `Bearer ${await accessToken(cfg.account)}`;

    const send = (thinkingLevel: string) =>
      fetch(generateContentUrl(cfg), {
        method: "POST",
        headers,
        body: JSON.stringify(buildRequest({ ...opts, thinkingLevel })),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

    let res = await send(cfg.thinkingLevel);
    if (res.status === 400 && cfg.thinkingLevel) {
      const detail = await res.text();
      // A model that doesn't take a thinking level: ask again without one.
      if (/thinking/i.test(detail)) res = await send("");
      else {
        console.error(`vertex 400: ${detail.slice(0, 300)}`);
        return { ok: false, error: userError(400) };
      }
    }
    if (!res.ok) {
      console.error(`vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { ok: false, error: userError(res.status) };
    }
    const out = responseText(await res.json());
    if ("error" in out) {
      console.error("vertex:", out.error);
      return { ok: false, error: "AI did not return a result." };
    }
    return { ok: true, text: out.text };
  } catch (err) {
    console.error("vertex request failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "AI is not available right now." };
  }
}

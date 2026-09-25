import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  buildRequest,
  generateContentUrl,
  imagePart,
  responseText,
  signServiceAccountJwt,
  vertexConfig,
  vertexVision,
  type VertexConfig,
} from "./vertex.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ACCOUNT = { client_email: "suredose@my-proj.iam.gserviceaccount.com", private_key: PEM, project_id: "my-proj" };
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

test("config: API key wins, defaults applied", () => {
  const c = vertexConfig({ GOOGLE_VERTEX_API_KEY: " k " }) as VertexConfig;
  assert.equal(c.auth, "apiKey");
  assert.equal(c.model, "gemini-3.6-flash");
  assert.equal(c.thinkingLevel, "low");
  assert.equal(
    generateContentUrl(c),
    "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.6-flash:generateContent",
  );
});

test("config: service account, global and regional endpoints", () => {
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT) };
  const g = vertexConfig(env) as VertexConfig;
  assert.equal(g.auth, "serviceAccount");
  assert.equal(
    generateContentUrl(g),
    "https://aiplatform.googleapis.com/v1/projects/my-proj/locations/global/publishers/google/models/gemini-3.6-flash:generateContent",
  );
  const r = vertexConfig({ ...env, GOOGLE_CLOUD_LOCATION: "us-central1", VERTEX_MODEL: "gemini-3.8-flash" }) as VertexConfig;
  assert.equal(
    generateContentUrl(r),
    "https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-3.8-flash:generateContent",
  );
});

test("config: nothing set / bad JSON / no project", () => {
  assert.equal(vertexConfig({}), null);
  assert.ok("error" in (vertexConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: "{nope" }) as object));
  const noProject = { ...ACCOUNT, project_id: undefined };
  assert.ok("error" in (vertexConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(noProject) }) as object));
});

test("request body: prompt, inline images, JSON output, thinking level", () => {
  assert.deepEqual(imagePart(IMG), { inlineData: { mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" } });
  assert.equal(imagePart("https://example.com/x.jpg"), null);
  const body = buildRequest({ prompt: "hi", images: [IMG, IMG], maxTokens: 200, thinkingLevel: "low" }) as {
    contents: { parts: unknown[] }[];
    generationConfig: Record<string, unknown>;
  };
  assert.equal(body.contents[0].parts.length, 3);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.maxOutputTokens, 4096);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "LOW" });
  const plain = buildRequest({ prompt: "hi", images: [], maxTokens: 200, thinkingLevel: "" }) as {
    generationConfig: Record<string, unknown>;
  };
  assert.equal(plain.generationConfig.thinkingConfig, undefined);
});

test("response: skips thought parts, reports blocks and empties", () => {
  assert.deepEqual(
    responseText({ candidates: [{ content: { parts: [{ text: "hmm", thought: true }, { text: '{"a":1}' }] } }] }),
    { text: '{"a":1}' },
  );
  assert.ok("error" in responseText({ promptFeedback: { blockReason: "SAFETY" } }));
  assert.ok("error" in responseText({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }));
});

test("service-account JWT is a valid RS256 signature", async () => {
  const jwt = await signServiceAccountJwt(ACCOUNT, 1_800_000_000);
  const [h, c, s] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.iss, ACCOUNT.client_email);
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claims.scope, "https://www.googleapis.com/auth/cloud-platform");
  assert.equal(claims.exp - claims.iat, 3600);
  const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"));
  assert.equal(ok, true);
  // Keys pasted with literal "\n" sequences still work.
  await signServiceAccountJwt({ ...ACCOUNT, private_key: PEM.replace(/\n/g, "\\n") }, 1);
});

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const answer = (text: string) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });

test("vertexVision with a service account: token once, then cached", async () => {
  const m = mockFetch((url) =>
    url.startsWith("https://oauth2.googleapis.com")
      ? Response.json({ access_token: "tok-1", expires_in: 3600 })
      : answer('{"match":true}'),
  );
  try {
    const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT) };
    const r1 = await vertexVision({ prompt: "p", images: [IMG], maxTokens: 100 }, env);
    const r2 = await vertexVision({ prompt: "p", images: [IMG], maxTokens: 100 }, env);
    assert.deepEqual(r1, { ok: true, text: '{"match":true}' });
    assert.deepEqual(r2, r1);
    assert.equal(m.calls.filter((c) => c.url.includes("oauth2")).length, 1);
    const gen = m.calls.find((c) => c.url.includes(":generateContent"))!;
    assert.equal((gen.init.headers as Record<string, string>).authorization, "Bearer tok-1");
  } finally {
    m.restore();
  }
});

test("vertexVision with an API key; retries without thinking level if refused", async () => {
  let n = 0;
  const m = mockFetch((_url, init) => {
    n += 1;
    const body = JSON.parse(String(init.body));
    if (body.generationConfig.thinkingConfig) {
      return new Response('{"error":{"message":"thinking_level is not supported"}}', { status: 400 });
    }
    return answer('{"name":"Lisinopril"}');
  });
  try {
    const r = await vertexVision({ prompt: "p", images: [IMG], maxTokens: 100 }, { GOOGLE_VERTEX_API_KEY: "k" });
    assert.deepEqual(r, { ok: true, text: '{"name":"Lisinopril"}' });
    assert.equal(n, 2);
    assert.equal((m.calls[0].init.headers as Record<string, string>)["x-goog-api-key"], "k");
  } finally {
    m.restore();
  }
});

test("vertexVision never throws: plain-English errors", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await vertexVision({ prompt: "p", images: [], maxTokens: 1 }, {}), {
      ok: false,
      error: "AI is not available right now.",
    });
    let m = mockFetch(() => new Response("slow down", { status: 429 }));
    let r = await vertexVision({ prompt: "p", images: [], maxTokens: 1 }, { GOOGLE_VERTEX_API_KEY: "k" });
    assert.equal(r.ok ? "" : r.error, "The photo checker is busy. Please try again in a minute.");
    m.restore();
    m = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    r = await vertexVision({ prompt: "p", images: [], maxTokens: 1 }, { GOOGLE_VERTEX_API_KEY: "k" });
    assert.equal(r.ok, false);
    m.restore();
  } finally {
    console.error = quiet;
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { vision, visionProvider } from "./vision.ts";
import { buildMetaRequest, metaConfig, metaVision } from "./vision-meta.ts";

const image = "data:image/jpeg;base64,AAAABBBBCCCCDDDD";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const okReply = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

test("google stays the default; meta only when explicitly selected", () => {
  assert.equal(visionProvider({}), "google");
  assert.equal(visionProvider({ VISION_PROVIDER: "google" }), "google");
  assert.equal(visionProvider({ VISION_PROVIDER: " META " }), "meta");
  assert.equal(visionProvider({ VISION_PROVIDER: "something-else" }), "google");
});

test("meta config needs a key and has safe defaults", () => {
  assert.equal(metaConfig({}), null);
  const cfg = metaConfig({ META_API_KEY: "k" });
  assert.deepEqual(cfg, {
    apiKey: "k",
    model: "muse-spark-1.3",
    baseUrl: "https://api.meta.ai/v1",
  });
  assert.equal(
    metaConfig({ META_API_KEY: "k", META_API_BASE_URL: "https://x.test/v1/" })?.baseUrl,
    "https://x.test/v1",
  );
});

test("request uses the documented chat format with the photo as a data URL", () => {
  const body = buildMetaRequest({ prompt: "p", images: [image], maxTokens: 300, model: "m" });
  assert.equal(body.model, "m");
  assert.equal(body.max_tokens, 300);
  assert.deepEqual(body.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "p" },
        { type: "image_url", image_url: { url: image } },
      ],
    },
  ]);
});

test("non-data-URL images are refused before any network call", () => {
  assert.throws(() =>
    buildMetaRequest({
      prompt: "p",
      images: ["https://example.com/a.jpg"],
      maxTokens: 1,
      model: "m",
    }),
  );
});

test("meta call sends bearer auth, posts to chat completions, returns the text", async () => {
  const m = mockFetch(() => okReply('{"quality":"clear"}'));
  try {
    const res = await metaVision(
      { prompt: "p", images: [image], maxTokens: 100 },
      { META_API_KEY: "secret-key" },
    );
    assert.deepEqual(res, { ok: true, text: '{"quality":"clear"}' });
    assert.equal(m.calls[0].url, "https://api.meta.ai/v1/chat/completions");
    const headers = m.calls[0].init.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer secret-key");
  } finally {
    m.restore();
  }
});

test("meta errors become plain messages and never throw", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const busy = mockFetch(() => new Response("slow down", { status: 429 }));
    try {
      const res = await metaVision(
        { prompt: "p", images: [image], maxTokens: 1 },
        { META_API_KEY: "k" },
      );
      assert.equal(res.ok, false);
      if (!res.ok) assert.match(res.error, /busy/);
    } finally {
      busy.restore();
    }
    const empty = mockFetch(() => okReply("   "));
    try {
      const res = await metaVision(
        { prompt: "p", images: [image], maxTokens: 1 },
        { META_API_KEY: "k" },
      );
      assert.equal(res.ok, false);
    } finally {
      empty.restore();
    }
    const missing = await metaVision({ prompt: "p", images: [image], maxTokens: 1 }, {});
    assert.equal(missing.ok, false);
  } finally {
    console.error = quiet;
  }
});

test("vision() routes to google by default, and to meta when selected", async () => {
  const m = mockFetch(() => okReply('{"ok":true}'));
  try {
    // Google with no credentials fails closed without any network call.
    const google = await vision({ prompt: "p", images: [image], maxTokens: 1 }, {});
    assert.equal(google.ok, false);
    assert.equal(m.calls.length, 0);

    const meta = await vision(
      { prompt: "p", images: [image], maxTokens: 1 },
      { VISION_PROVIDER: "meta", META_API_KEY: "k" },
    );
    assert.deepEqual(meta, { ok: true, text: '{"ok":true}' });
    assert.equal(m.calls.length, 1);
    assert.match(m.calls[0].url, /api\.meta\.ai/);
  } finally {
    m.restore();
  }
});

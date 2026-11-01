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

const googleReply = (text: string, status = 200) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status },
  );

const readableLabel = '{"name":"Metformin","strength":"500 mg"}';

async function withQuietErrors<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

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

test("Google default never calls Meta", async () => {
  const m = mockFetch((url) => {
    assert.match(url, /aiplatform\.googleapis\.com/);
    return googleReply(readableLabel);
  });
  try {
    const result = await vision(
      { prompt: "p", images: [image], maxTokens: 1 },
      { GOOGLE_VERTEX_API_KEY: "test-google-key", META_API_KEY: "test-meta-key" },
    );
    assert.deepEqual(result, { ok: true, text: readableLabel });
    assert.equal(m.calls.length, 1);
  } finally {
    m.restore();
  }
});

test("Meta success never calls Google", async () => {
  const m = mockFetch((url) => {
    assert.match(url, /api\.meta\.ai/);
    return okReply(readableLabel);
  });
  try {
    const result = await vision(
      { prompt: "p", images: [image], maxTokens: 1 },
      { VISION_PROVIDER: "meta", META_API_KEY: "test-meta-key" },
    );
    assert.deepEqual(result, { ok: true, text: readableLabel });
    assert.equal(m.calls.length, 1);
  } finally {
    m.restore();
  }
});

test("Meta throws and Google fallback succeeds", async () => {
  const m = mockFetch((url) => {
    if (url.includes("api.meta.ai")) throw new Error("mock Meta network failure");
    return googleReply(readableLabel);
  });
  try {
    const result = await withQuietErrors(() =>
      vision(
        { prompt: "p", images: [image], maxTokens: 1 },
        {
          VISION_PROVIDER: "meta",
          META_API_KEY: "test-meta-key",
          GOOGLE_VERTEX_API_KEY: "test-google-key",
        },
      ),
    );
    assert.deepEqual(result, { ok: true, text: readableLabel });
    assert.equal(m.calls.length, 2);
    assert.match(m.calls[0].url, /api\.meta\.ai/);
    assert.match(m.calls[1].url, /aiplatform\.googleapis\.com/);
  } finally {
    m.restore();
  }
});

test("low-confidence Meta response falls back to Google", async () => {
  const unclear = '{"name":"","strength":"","timesPerDay":null,"times":[]}';
  const m = mockFetch((url) =>
    url.includes("api.meta.ai") ? okReply(unclear) : googleReply(readableLabel),
  );
  try {
    const result = await vision(
      { prompt: "p", images: [image], maxTokens: 1 },
      {
        VISION_PROVIDER: "meta",
        META_API_KEY: "test-meta-key",
        GOOGLE_VERTEX_API_KEY: "test-google-key",
      },
    );
    assert.deepEqual(result, { ok: true, text: readableLabel });
    assert.equal(m.calls.length, 2);
  } finally {
    m.restore();
  }
});

test("unreadable responses from both providers return the manual-check error", async () => {
  const unclear = '{"name":"","strength":"","timesPerDay":null,"times":[]}';
  const m = mockFetch((url) =>
    url.includes("api.meta.ai") ? okReply(unclear) : googleReply(unclear),
  );
  try {
    const result = await vision(
      { prompt: "p", images: [image], maxTokens: 1 },
      {
        VISION_PROVIDER: "meta",
        META_API_KEY: "test-meta-key",
        GOOGLE_VERTEX_API_KEY: "test-google-key",
      },
    );
    assert.deepEqual(result, {
      ok: false,
      error:
        "We could not check this clearly. Please check the details manually or ask your pharmacist.",
    });
    assert.equal(m.calls.length, 2);
  } finally {
    m.restore();
  }
});

test("unrecognised provider calls Google only", async () => {
  const m = mockFetch((url) => {
    assert.match(url, /aiplatform\.googleapis\.com/);
    return googleReply(readableLabel);
  });
  try {
    const result = await vision(
      { prompt: "p", images: [image], maxTokens: 1 },
      {
        VISION_PROVIDER: "not-a-provider",
        GOOGLE_VERTEX_API_KEY: "test-google-key",
        META_API_KEY: "test-meta-key",
      },
    );
    assert.deepEqual(result, { ok: true, text: readableLabel });
    assert.equal(m.calls.length, 1);
  } finally {
    m.restore();
  }
});

test("Meta HTTP and malformed responses fall back to Google", async () => {
  const m = mockFetch((url) =>
    url.includes("api.meta.ai")
      ? new Response("unavailable", { status: 503 })
      : googleReply(readableLabel),
  );
  try {
    const result = await withQuietErrors(() =>
      vision(
        { prompt: "p", images: [image], maxTokens: 1 },
        {
          VISION_PROVIDER: "meta",
          META_API_KEY: "test-meta-key",
          GOOGLE_VERTEX_API_KEY: "test-google-key",
        },
      ),
    );
    assert.deepEqual(result, { ok: true, text: readableLabel });
    assert.equal(m.calls.length, 2);
  } finally {
    m.restore();
  }
});

test("Meta unparseable model text falls back to Google", async () => {
  const m = mockFetch((url) =>
    url.includes("api.meta.ai") ? okReply("not JSON") : googleReply(readableLabel),
  );
  try {
    const result = await vision(
      { prompt: "p", images: [image], maxTokens: 1 },
      {
        VISION_PROVIDER: "meta",
        META_API_KEY: "test-meta-key",
        GOOGLE_VERTEX_API_KEY: "test-google-key",
      },
    );
    assert.deepEqual(result, { ok: true, text: readableLabel });
    assert.equal(m.calls.length, 2);
  } finally {
    m.restore();
  }
});

import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { explainPushFailure, sendTestAlert, subscribePush } from "./care.ts";
import { installTestDb } from "./test-d1.ts";
import { createHousehold } from "./care.ts";
import { sendPushToHousehold, vapidProblem } from "./push.server.ts";

// A stand-in for a phone's push service (Google's or Apple's): `fetch` to the
// fake host is recorded instead of sent. The keys are real P-256 keys, so the
// encryption and the VAPID signing run for real; only the network hop is fake.
const origin = "https://push.example.test";
const received: { path: string; headers: Headers; bytes: number }[] = [];
let status = 201;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== origin) return realFetch(input, init);
  const body = init?.body as Uint8Array | ArrayBuffer | string | undefined;
  received.push({
    path: url.pathname,
    headers: new Headers(init?.headers),
    bytes: typeof body === "string" ? body.length : (body?.byteLength ?? 0),
  });
  return new Response(null, { status });
}) as typeof fetch;
after(() => {
  globalThis.fetch = realFetch;
});

function vapidPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const priv = privateKey.export({ format: "jwk" }) as { d: string };
  return {
    publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]).toString("base64url"),
    privateKey: priv.d,
  };
}

function phoneKeys() {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  return {
    p256dh: Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]).toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

async function pairedPhone(path = "/phone-1") {
  const created = await createHousehold({ data: { patientName: "Ana", caregiverName: "", caregiverPhone: "" } });
  const code = (created as { code: string }).code;
  const endpoint = `${origin}${path}`;
  await subscribePush({ data: { code, subscription: { endpoint, keys: phoneKeys() } } });
  return { code, endpoint };
}

beforeEach(() => {
  installTestDb();
  received.length = 0;
  status = 201;
  const keys = vapidPair();
  process.env.VITE_VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
});

test("a test alert is encrypted, signed and delivered to the phone's push service", async () => {
  const { code, endpoint } = await pairedPhone();
  assert.deepEqual(await sendTestAlert({ data: { code, endpoint } }), { ok: true });
  assert.equal(received.length, 1);
  assert.equal(received[0].path, "/phone-1");
  assert.match(received[0].headers.get("authorization") ?? "", /^vapid /);
  assert.equal(received[0].headers.get("content-encoding"), "aes128gcm");
  assert.ok(received[0].bytes > 100, "an encrypted payload was sent");
});

test("a dose alert reaches every phone paired to the household", async () => {
  const { code } = await pairedPhone("/phone-1");
  await subscribePush({ data: { code, subscription: { endpoint: `${origin}/phone-2`, keys: phoneKeys() } } });
  const res = await sendPushToHousehold(code, { title: "Medicine taken", body: "Aspirin taken at 9:30 AM." });
  assert.deepEqual(res, { configured: true, sent: 2, failed: 0 });
  assert.deepEqual(received.map((r) => r.path).sort(), ["/phone-1", "/phone-2"]);
});

test("a phone whose push service says it is gone is removed, and the alert counts as failed", async () => {
  const { code, endpoint } = await pairedPhone();
  status = 410;
  const res = await sendTestAlert({ data: { code, endpoint } });
  assert.equal(res.ok, false);
  const again = await sendTestAlert({ data: { code, endpoint } });
  assert.match((again as { error: string }).error, /not registered/);
});

test("a key pasted with a label or quotes is cleaned, a broken one switches push off", async () => {
  const { code } = await pairedPhone();
  process.env.VITE_VAPID_PUBLIC_KEY = `"${process.env.VITE_VAPID_PUBLIC_KEY}"`;
  assert.equal((await sendPushToHousehold(code, { title: "t", body: "b" })).sent, 1);
  process.env.VITE_VAPID_PUBLIC_KEY = "Public Key: not-a-key";
  assert.equal((await sendPushToHousehold(code, { title: "t", body: "b" })).configured, false);
});

test("a refused test alert says why, in words that point at the fix", async () => {
  const { code, endpoint } = await pairedPhone();
  status = 403;
  const mismatch = await sendTestAlert({ data: { code, endpoint } });
  assert.match((mismatch as { error: string }).error, /does not match the public key/);
  status = 429;
  const limited = await sendTestAlert({ data: { code, endpoint } });
  assert.match((limited as { error: string }).error, /rate limiting/);
  assert.match(explainPushFailure(undefined, "boom"), /boom/);
  assert.match(explainPushFailure(), /could not be sent/);
});

test("the setup check passes for a matching key pair", async () => {
  assert.equal(await vapidProblem(), null);
});

test("the setup check names the exact problem before any alert is sent", async () => {
  const good = { pub: process.env.VITE_VAPID_PUBLIC_KEY!, priv: process.env.VAPID_PRIVATE_KEY! };

  // A private key from a different generator run: the classic cause of a silent failure.
  process.env.VAPID_PRIVATE_KEY = vapidPair().privateKey;
  assert.match((await vapidProblem()) ?? "", /does not match the public key/);
  process.env.VAPID_PRIVATE_KEY = good.priv;

  process.env.VAPID_SUBJECT = "you@example.com"; // forgot "mailto:"
  assert.match((await vapidProblem()) ?? "", /VAPID_SUBJECT is not valid/);
  process.env.VAPID_SUBJECT = "mailto:test@example.com";

  process.env.VAPID_PRIVATE_KEY = "Private Key: " + good.priv;
  assert.match((await vapidProblem()) ?? "", /VAPID_PRIVATE_KEY is not valid/);
  process.env.VAPID_PRIVATE_KEY = good.priv;

  process.env.VITE_VAPID_PUBLIC_KEY = "oops";
  assert.match((await vapidProblem()) ?? "", /public push key .* not valid/);
  process.env.VITE_VAPID_PUBLIC_KEY = good.pub;

  delete process.env.VAPID_PRIVATE_KEY;
  assert.match((await vapidProblem()) ?? "", /push keys are missing/);
});

test("a test alert reports a mismatched key pair instead of failing silently", async () => {
  const { code, endpoint } = await pairedPhone();
  process.env.VAPID_PRIVATE_KEY = vapidPair().privateKey;
  const res = await sendTestAlert({ data: { code, endpoint } });
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /does not match the public key/);
  assert.equal(received.length, 0, "nothing was sent to the push service");
});

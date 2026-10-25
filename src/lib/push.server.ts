import { buildPushPayload, type PushSubscription as WebPushSubscription } from "@block65/webcrypto-web-push";
import { q, run } from "./db";
import { cleanVapidPublicKey, decodeBase64Url, encodeBase64Url } from "./vapid";

/**
 * Web Push needs a VAPID key pair (identifies this server to the push
 * services) plus a contact subject. Generate one with, e.g., the `web-push`
 * CLI (`npx web-push generate-vapid-keys` — the CLI is fine to run locally
 * even though we don't use that package's runtime code) and set:
 *   VITE_VAPID_PUBLIC_KEY  (not secret; export it before `npm run build`)
 *   VAPID_PRIVATE_KEY      (server-only secret)
 *   VAPID_SUBJECT          ("mailto:you@example.com" or an https URL)
 * On Cloudflare, set these with `wrangler secret put <NAME>` (or as plain
 * vars for the non-secret public key) — with `nodejs_compat` enabled they
 * still show up on `process.env` exactly like on Node.
 * Without all three, sendPushToHousehold() is a silent no-op — the rest of
 * the app (reminders, local schedule, SMS) is unaffected.
 *
 * Uses @block65/webcrypto-web-push instead of the `web-push` npm package:
 * `web-push` calls Node's `crypto.createECDH`, which Cloudflare Workers does
 * not implement, so it fails there. This library builds the same encrypted
 * request using the standard WebCrypto API, so the exact same code runs on
 * Node (Vercel, etc.) and on Cloudflare Workers.
 */
/**
 * The public key is not secret and the phones already get it in the client
 * build, so the build's copy is the fallback: exporting it once before
 * `npm run build` is enough, with no runtime variable to keep in sync.
 * (`import.meta.env` only exists in a Vite build, hence the guard.)
 */
function buildPublicKey(): string | undefined {
  return typeof import.meta.env === "undefined"
    ? undefined
    : (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined);
}

function vapidKeys(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = cleanVapidPublicKey(process.env.VITE_VAPID_PUBLIC_KEY || buildPublicKey());
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { subject, publicKey, privateKey };
}

/**
 * `url` is where tapping the notification goes (same origin, default "/").
 * `urgent` makes the caregiver's phone vibrate longer (a missed dose).
 */
export type PushPayload = { title: string; body: string; tag?: string; url?: string; urgent?: boolean };

/**
 * Checks the server's push setup without contacting any push service, and says
 * in plain words what is wrong; null means it looks usable. The failure that
 * cannot be seen from a phone is a private key that is not the pair of the
 * public key in the build: Google's push service refuses every alert for it.
 * The check signs a test message with the private key and verifies it with the
 * public key, which only succeeds for a matching pair.
 */
export async function vapidProblem(): Promise<string | null> {
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "").trim();
  const rawPublic = process.env.VITE_VAPID_PUBLIC_KEY || buildPublicKey();
  if (!privateKey || !subject) {
    return "Alerts are not set up on the server yet (the push keys are missing).";
  }
  if (!/^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/.test(subject)) {
    return "The server's VAPID_SUBJECT is not valid. It must start with mailto: followed by an email address (for example mailto:you@example.com), or be an https:// address.";
  }
  const publicKey = cleanVapidPublicKey(rawPublic);
  if (!publicKey) {
    return "The public push key in this version of the app is not valid. It must be exactly the 87-character Public Key, with no label, quotes or spaces. Rebuild with the corrected key and deploy again.";
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(privateKey)) {
    return "The server's VAPID_PRIVATE_KEY is not valid. It must be exactly the 43-character Private Key from the same key generator run, with no label, quotes or spaces.";
  }
  try {
    const point = decodeBase64Url(publicKey);
    const x = encodeBase64Url(point.slice(1, 33));
    const y = encodeBase64Url(point.slice(33, 65));
    const algorithm = { name: "ECDSA", namedCurve: "P-256" } as const;
    const signing = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x, y, d: privateKey }, algorithm, false, ["sign"]);
    const verifying = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x, y }, algorithm, false, ["verify"]);
    const message = new TextEncoder().encode("suredose-vapid-check");
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signing, message);
    if (!(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifying, signature, message))) {
      throw new Error("pair mismatch");
    }
  } catch {
    return "The private key on the server does not match the public key in this version of the app. Generate one new key pair, build with its Public Key, set its Private Key as the VAPID_PRIVATE_KEY secret, deploy, then turn alerts off and on again on the phone.";
  }
  return null;
}

export type PushResult = {
  /** False when the server has no VAPID keys, so nothing could be sent. */
  configured: boolean;
  sent: number;
  failed: number;
  /** The last HTTP status a push service answered with when it refused an alert. */
  status?: number;
  /** The last network or encryption error, when no answer came back at all. */
  error?: string;
};

/**
 * Best-effort: send a push notification to every device paired to this
 * household (or just the one `endpoint`, for a test alert). Never throws for a
 * delivery problem; the counts say what happened.
 */
export async function sendPushToHousehold(
  householdCode: string,
  payload: PushPayload,
  options: { endpoint?: string } = {},
): Promise<PushResult> {
  const result: PushResult = { configured: true, sent: 0, failed: 0 };
  const vapid = vapidKeys();
  if (!vapid) return { ...result, configured: false };

  const subs = await q<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    options.endpoint
      ? "select id, endpoint, p256dh, auth from push_subscriptions where household_id = ? and endpoint = ?"
      : "select id, endpoint, p256dh, auth from push_subscriptions where household_id = ?",
    options.endpoint ? [householdCode, options.endpoint] : [householdCode],
  );
  if (subs.length === 0) return result;

  await Promise.all(
    subs.map(async (sub) => {
      const subscription: WebPushSubscription = {
        endpoint: sub.endpoint,
        expirationTime: null,
        keys: { auth: sub.auth, p256dh: sub.p256dh },
      };
      try {
        const { headers, body, method } = await buildPushPayload(
          { data: payload, options: { ttl: 3600 } },
          subscription,
          vapid,
        );
        const res = await fetch(sub.endpoint, { method: method.toUpperCase(), headers, body });
        if (res.status === 404 || res.status === 410) {
          // The browser unsubscribed or the subscription expired — clean it up.
          await run("delete from push_subscriptions where id = ?", [sub.id]);
          result.failed += 1;
          result.status = res.status;
        } else if (!res.ok) {
          console.error("[push] send failed:", res.status, await res.text().catch(() => ""));
          result.failed += 1;
          result.status = res.status;
        } else {
          result.sent += 1;
        }
      } catch (err) {
        console.error("[push] send failed:", err);
        result.failed += 1;
        result.error = err instanceof Error ? err.message : String(err);
      }
    }),
  );
  return result;
}

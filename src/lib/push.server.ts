import { buildPushPayload, type PushSubscription as WebPushSubscription } from "@block65/webcrypto-web-push";
import { q, run } from "./db";
import { cleanVapidPublicKey } from "./vapid";

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
function vapidKeys(): { subject: string; publicKey: string; privateKey: string } | null {
  // The public key is not secret and the phones already get it in the client
  // build, so the build's copy is the fallback: exporting it once before
  // `npm run build` is enough, with no runtime variable to keep in sync.
  // (`import.meta.env` only exists in a Vite build, hence the guard.)
  const buildKey =
    typeof import.meta.env === "undefined"
      ? undefined
      : (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined);
  const publicKey = cleanVapidPublicKey(process.env.VITE_VAPID_PUBLIC_KEY || buildKey);
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

export type PushResult = {
  /** False when the server has no VAPID keys, so nothing could be sent. */
  configured: boolean;
  sent: number;
  failed: number;
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
        } else if (!res.ok) {
          console.error("[push] send failed:", res.status, await res.text().catch(() => ""));
          result.failed += 1;
        } else {
          result.sent += 1;
        }
      } catch (err) {
        console.error("[push] send failed:", err);
        result.failed += 1;
      }
    }),
  );
  return result;
}

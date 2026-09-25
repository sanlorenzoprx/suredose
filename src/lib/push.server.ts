import { buildPushPayload, type PushSubscription as WebPushSubscription } from "@block65/webcrypto-web-push";
import { getSql } from "./db";

/**
 * Web Push needs a VAPID key pair (identifies this server to the push
 * services) plus a contact subject. Generate one with, e.g., the `web-push`
 * CLI (`npx web-push generate-vapid-keys` — the CLI is fine to run locally
 * even though we don't use that package's runtime code) and set:
 *   VITE_VAPID_PUBLIC_KEY  (also readable client-side, not secret)
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
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { subject, publicKey, privateKey };
}

export type PushPayload = { title: string; body: string; tag?: string };

/** Best-effort: send a push notification to every device paired to this household. */
export async function sendPushToHousehold(householdCode: string, payload: PushPayload): Promise<void> {
  const vapid = vapidKeys();
  if (!vapid) return;

  const sql = await getSql();
  const subs = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }>`
    select id, endpoint, p256dh, auth from push_subscriptions where household_id = ${householdCode}
  `;
  if (subs.length === 0) return;

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
          await sql`delete from push_subscriptions where id = ${sub.id}`;
        } else if (!res.ok) {
          console.error("[push] send failed:", res.status, await res.text().catch(() => ""));
        }
      } catch (err) {
        console.error("[push] send failed:", err);
      }
    }),
  );
}

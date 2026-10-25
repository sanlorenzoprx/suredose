import { subscribePush, unsubscribePush } from "./care";
import { cleanVapidPublicKey, decodeBase64Url } from "./vapid";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

function isIphone(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isInstalledApp(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Why this phone cannot get alerts right now, in words a person can act on; null when it can. */
export function alertBlocker(): string | null {
  if (typeof window === "undefined") return null;
  if (isIphone() && !isInstalledApp()) {
    return "On an iPhone, alerts only work from the Home Screen. Tap the Share button, choose Add to Home Screen, open SureDose from that new icon, then tap Turn on alerts.";
  }
  if (!pushSupported() || typeof Notification === "undefined") {
    return "This browser cannot receive alerts. On Android, use Chrome. On an iPhone, add SureDose to the Home Screen first.";
  }
  if (Notification.permission === "denied") {
    return "Notifications are blocked for SureDose. In your phone's settings, allow notifications for this app (or your browser), then try again.";
  }
  return null;
}

/** Rejects with `message` if `work` takes longer than `ms`, so a step can never hang the screen. */
function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** This phone's existing alert subscription, if it has one and notifications are still allowed. */
export async function currentAlertEndpoint(): Promise<string | null> {
  if (!pushSupported() || typeof Notification === "undefined" || Notification.permission !== "granted") {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await registration?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function enableCaregiverAlerts(
  code: string,
): Promise<{ ok: boolean; error?: string; endpoint?: string }> {
  const blocker = alertBlocker();
  if (blocker) return { ok: false, error: blocker };
  const rawKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!rawKey) {
    return { ok: false, error: "Alerts are not set up yet for this app (the public push key is missing from this version)." };
  }
  const vapidKey = cleanVapidPublicKey(rawKey);
  if (!vapidKey) {
    return {
      ok: false,
      error:
        "The push key built into this version of SureDose is not valid. It must be exactly the 87-character Public Key from the key generator, with no label, quotes or spaces. Rebuild with the corrected key and deploy again.",
    };
  }
  try {
    const permission = await withTimeout(
      Notification.requestPermission(),
      60_000,
      "The permission question did not appear. Check that notifications are allowed for SureDose in your phone's settings.",
    );
    if (permission !== "granted") {
      return { ok: false, error: "Notifications are turned off for this app in your phone settings." };
    }
    const registration = await withTimeout(
      navigator.serviceWorker.register("/sw.js"),
      15_000,
      "This phone could not start the alert helper. Close the app completely, open it again, and retry.",
    );
    await withTimeout(
      navigator.serviceWorker.ready,
      15_000,
      "The alert helper did not start. Close the app completely, open it again, and retry.",
    );
    let sub = await registration.pushManager.getSubscription();
    // A registration made with a different key (the key pair was changed since)
    // looks fine on the phone but every alert for it is refused, so replace it.
    const existingKey = sub?.options?.applicationServerKey;
    if (sub && existingKey) {
      const have = new Uint8Array(existingKey);
      const want = decodeBase64Url(vapidKey);
      if (have.length !== want.length || have.some((byte, i) => byte !== want[i])) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) {
      sub = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64Url(vapidKey) as unknown as BufferSource,
        }),
        20_000,
        "This phone's notification service did not answer. Check your connection and retry.",
      );
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      return { ok: false, error: "Could not turn on alerts. Please try again." };
    }
    const res = await withTimeout(
      subscribePush({
        data: {
          code,
          subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        },
      }),
      20_000,
      "Could not reach SureDose to save the alert. Check your connection and retry.",
    );
    if (!res.ok) return { ok: false, error: res.error ?? "Could not turn on alerts." };
    return { ok: true, endpoint: json.endpoint };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.message ? err.message : "Could not turn on alerts on this phone.",
    };
  }
}

export async function disableCaregiverAlerts(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await registration?.pushManager.getSubscription();
    if (sub) {
      await unsubscribePush({ data: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
  } catch {
    /* best effort */
  }
}

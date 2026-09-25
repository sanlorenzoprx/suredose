import { subscribePush, unsubscribePush } from "./care";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function enableCaregiverAlerts(code: string): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) {
    return { ok: false, error: "This phone's browser does not support alerts. You can still open the app to check." };
  }
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) {
    return { ok: false, error: "Alerts are not set up yet for this app." };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, error: "Notifications are turned off for this app in your phone settings." };
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      return { ok: false, error: "Could not turn on alerts. Please try again." };
    }
    const res = await subscribePush({
      data: {
        code,
        subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
      },
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Could not turn on alerts." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not turn on alerts on this phone." };
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

// Push-only service worker — SureDose doesn't need offline caching, just a
// place for the browser to deliver push events to when the app isn't open.

// Vibration pattern in ms (on, off, on, …). Android Chrome honors it; iPhones
// ignore it. A missed dose buzzes longer than a dose taken. The ring sound is
// the phone's own notification sound — a web page cannot choose a louder one.
const VIBRATE_TAKEN = [200, 100, 200];
const VIBRATE_URGENT = [500, 200, 500, 200, 500, 200, 500];

self.addEventListener("push", (event) => {
  let data = { title: "SureDose", body: "You have an update." };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Malformed or empty payload — fall back to the generic message above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "SureDose", {
      body: data.body || "",
      tag: data.tag || "suredose",
      icon: "/__grok/icon-180.png",
      badge: "/__grok/icon-180.png",
      requireInteraction: true,
      renotify: true,
      vibrate: data.urgent ? VIBRATE_URGENT : VIBRATE_TAKEN,
      data: { url: typeof data.url === "string" ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Same-origin only: ignore any URL that points elsewhere.
  let target = new URL("/", self.location.origin);
  try {
    const candidate = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (candidate.origin === self.location.origin) target = candidate;
  } catch {
    // Keep the home page.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus().then((focused) => {
            if (focused && "navigate" in focused && focused.url !== target.href) {
              return focused.navigate(target.href).catch(() => focused);
            }
            return focused;
          });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target.href);
      return undefined;
    }),
  );
});

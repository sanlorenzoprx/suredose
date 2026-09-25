// Push-only service worker — SureDose doesn't need offline caching, just a
// place for the browser to deliver push events to when the app isn't open.

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
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
      return undefined;
    }),
  );
});

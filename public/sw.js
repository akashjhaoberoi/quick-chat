/* Quick Chat service worker.
 *
 * Caching policy (privacy first):
 *   - Build assets (/_next/static, /icons, fonts): cache-first (immutable).
 *   - Page navigations: network-first; offline -> /offline fallback page.
 *   - /api/*, media, auth and anything cross-origin: NEVER cached, so private
 *     conversations and disappearing media are not persisted on the device.
 *
 * Push: Firebase Cloud Messaging delivers data-only messages; this worker
 * renders them so no duplicate notifications appear.
 */
const VERSION = "qc-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png", "/icons/badge-96.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|ttf)$/.test(url.pathname))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const json = event.data ? event.data.json() : {};
    payload = json.data || json;
  } catch {
    payload = { title: "Quick Chat", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Quick Chat";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: payload.tag || payload.id || undefined,
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/notifications", id: payload.id },
    requireInteraction: payload.type === "incoming_call",
    vibrate: payload.type === "incoming_call" ? [300, 150, 300, 150, 300] : [80],
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // While the app is visible the in-app UI (chat list, toaster) shows these; skip the OS copy.
      const visible = clients.some((c) => c.visibilityState === "visible");
      if (visible && IN_APP_TYPES.has(payload.type)) return undefined;
      return self.registration.showNotification(title, options);
    }),
  );
});

const IN_APP_TYPES = new Set([
  "message", "friend_request", "friend_accepted", "snap", "mention", "story_reaction",
  "story_reply", "group_invite", "missed_call", "follow",
]);

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

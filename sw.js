// The version lives in version.js (the only place to change it). The browser re-checks that file on every update check.
importScripts("version.js");   // defines APP_VERSION

const CACHE = `supermkt-${APP_VERSION}`;   // app files, replaced on every version
const SDK_CACHE = "supermkt-sdk-1";          // Firebase SDK modules (versioned URLs, kept between app versions)
const SHELL = [
  "./", "index.html", "styles.css", "version.js", "app.js", "firebase-config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  // Fetch fresh copies (bypass the HTTP cache). No skipWaiting(): the page asks the user first.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u === "./" ? u : `${u}?v=${APP_VERSION}`, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SDK_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "GET_VERSION") e.ports[0]?.postMessage(APP_VERSION);
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Versioned Firebase SDK modules: cache-first.
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(
      caches.open(SDK_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Everything else that isn't ours (Firebase data/auth, Google sign-in, ...) goes straight to the network.
  if (url.origin !== location.origin) return;

  // Own files: served from this version's cache. New files arrive only with a new APP_VERSION.
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        if (req.mode === "navigate") return (await c.match("index.html")) || Response.error();
        return Response.error();
      }
    })
  );
});

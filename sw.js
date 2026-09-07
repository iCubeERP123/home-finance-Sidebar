// Minimal service worker — required by browsers/Android before they will
// show the "Install app" prompt. Caches only the static app shell; every
// Supabase request still goes straight to the network (never cached),
// so your ledger data is always fresh.
const CACHE_NAME = "finance-ledger-shell-v1";
const SHELL_FILES = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only intercept simple GET navigations/asset requests. POST/PUT/etc.
  // (auth calls, form submits) must always go straight to the network.
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never cache Supabase API calls — always hit the network so data is live.
  if (url.hostname.endsWith(".supabase.co")) return;

  // Only manage same-origin requests ourselves; let the browser handle
  // cross-origin requests (fonts, CDNs, etc.) normally.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first. This is the one request type that
  // changes every time you redeploy index.html, so we always try to get
  // the freshest copy first and only fall back to the cached shell when
  // the network is unreachable (offline). Cache-first here would mean
  // every future edit to index.html stays invisible to returning users
  // until the CACHE_NAME below is bumped.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // Keep the cached shell fresh with whatever we just fetched.
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Everything else (icons, manifest.json): cache-first, since these
  // rarely change and cache-first means near-instant repeat loads.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => new Response("", { status: 504, statusText: "Offline" }));
    })
  );
});

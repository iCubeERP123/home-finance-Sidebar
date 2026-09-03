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

  // App shell: cache-first, falling back to network, with a safe fallback
  // if the network is unavailable so a failed fetch never rejects unhandled.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Offline and not cached — fall back to the cached shell page for
        // navigations; for other assets there's nothing sensible to return.
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});

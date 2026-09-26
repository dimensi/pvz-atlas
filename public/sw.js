const CACHE_NAME = "pvz-atlas-static-v6";
const NEXT_ASSET_CACHE_NAME = "pvz-atlas-next-assets-v6";
const CACHE_PREFIX = "pvz-atlas-";
const MAX_NEXT_ASSETS = 128;
const PUBLIC_ASSET_URLS = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/brand/logo.png",
  "/map-pins/pin-avito.png",
  "/map-pins/pin-cdek.png",
  "/map-pins/pin-fivepost.png",
  "/map-pins/pin-ozon.png",
  "/map-pins/pin-wildberries.png",
  "/map-pins/pin-yandex-market.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png"
];
const publicAssetPaths = new Set(PUBLIC_ASSET_URLS);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSET_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(CACHE_PREFIX) &&
                name !== CACHE_NAME &&
                name !== NEXT_ASSET_CACHE_NAME
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode === "navigate") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isNextAsset = url.pathname.startsWith("/_next/static/");
  if (!publicAssetPaths.has(url.pathname) && !isNextAsset) {
    return;
  }

  event.respondWith(
    caches.open(isNextAsset ? NEXT_ASSET_CACHE_NAME : CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }

      const response = await fetch(event.request);
      if (response.ok && !response.redirected) {
        event.waitUntil(
          cache.put(event.request, response.clone()).then(async () => {
            if (!isNextAsset) return;
            const keys = await cache.keys();
            await Promise.all(keys.slice(0, -MAX_NEXT_ASSETS).map((key) => cache.delete(key)));
          })
        );
      }

      return response;
    })
  );
});

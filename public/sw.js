const CACHE_NAME = "pvz-atlas-static-v6";
const NEXT_ASSET_CACHE_NAME = "pvz-atlas-next-assets-v6";
const CACHE_PREFIX = "pvz-atlas-";
const SHELL_CACHE_PREFIX = "pvz-atlas-shell-";
const SHELL_READY_URL = "/__pvz_shell_ready__";
const AUTH_CACHE_NAME = "pvz-atlas-auth-state";
const LOGOUT_MARKER_URL = "/__pvz_logout_pending__";
const MAP_TILE_CACHE_NAME = "pvz-atlas-map-tiles-v1";
const MAP_TILE_META_CACHE_NAME = "pvz-atlas-map-tiles-meta-v1";
const MAP_TILE_ORIGIN = "https://tile.openstreetmap.org";
const MAX_MAP_TILES = 512;
const DEFAULT_TILE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SHELL_ROUTES = ["/points", "/map", "/add", "/owners", "/sync"];
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
const shellRoutes = new Set(SHELL_ROUTES);
let warmPromise = null;
let warmGeneration = 0;

async function readyShellCache() {
  if (await hasPendingLogout()) return null;
  const names = (await caches.keys()).filter((name) => name.startsWith(SHELL_CACHE_PREFIX));
  for (const name of names.reverse()) {
    const cache = await caches.open(name);
    if (await cache.match(SHELL_READY_URL)) return cache;
  }
  return null;
}

async function hasPendingLogout() {
  const cache = await caches.open(AUTH_CACHE_NAME);
  return Boolean(await cache.match(LOGOUT_MARKER_URL));
}

async function clearShellCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith(SHELL_CACHE_PREFIX) ||
          name === MAP_TILE_CACHE_NAME ||
          name === MAP_TILE_META_CACHE_NAME
      )
      .map((name) => caches.delete(name))
  );
}

function isMapTile(url) {
  return (
    url.origin === MAP_TILE_ORIGIN &&
    /^\/(?:[0-9]|1[0-9]|2[0-2])\/\d+\/\d+\.png$/.test(url.pathname) &&
    !url.search
  );
}

function tileLifetime(response) {
  const directives = response.headers.get("cache-control") ?? "";
  if (/(?:^|,)\s*no-store(?:,|$)/i.test(directives)) return null;
  const maxAge = directives.match(/(?:^|,)\s*max-age=(\d+)/i);
  const staleIfError = directives.match(/(?:^|,)\s*stale-if-error=(\d+)/i);
  const now = Date.now();
  if (/(?:^|,)\s*no-cache(?:,|$)/i.test(directives)) {
    return { freshUntil: now, staleUntil: now + Number(staleIfError?.[1] ?? 0) * 1000 };
  }
  if (!maxAge) {
    const expiresAt = Date.parse(response.headers.get("expires") ?? "");
    if (Number.isFinite(expiresAt)) {
      return { freshUntil: expiresAt, staleUntil: expiresAt + Number(staleIfError?.[1] ?? 0) * 1000 };
    }
    return { freshUntil: now + DEFAULT_TILE_AGE_MS, staleUntil: now + DEFAULT_TILE_AGE_MS };
  }
  const freshUntil = now + Number(maxAge[1]) * 1000;
  return { freshUntil, staleUntil: freshUntil + Number(staleIfError?.[1] ?? 0) * 1000 };
}

function fetchMapTile(request) {
  // OSM permits CORS; a readable response lets us honor its caching headers.
  return fetch(request.url, {
      mode: "cors",
      credentials: "omit",
      referrer: `${self.location.origin}/`
  });
}

async function loadMapTile(request) {
  let tiles;
  let metadata;
  let cached;
  let lifetime;
  try {
    tiles = await caches.open(MAP_TILE_CACHE_NAME);
    metadata = await caches.open(MAP_TILE_META_CACHE_NAME);
    cached = await tiles.match(request);
    const age = await metadata.match(request);
    lifetime = age ? await age.json() : null;
  } catch {
    // An unavailable CacheStorage must not break an online map.
    return fetchMapTile(request);
  }
  if (cached && lifetime && Date.now() < lifetime.freshUntil) return cached;

  try {
    const response = await fetchMapTile(request);
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) {
      if (cached && lifetime && Date.now() < lifetime.staleUntil) return cached;
      return response;
    }
    const nextLifetime = tileLifetime(response);
    try {
      if (nextLifetime) {
        await Promise.all([
          tiles.put(request, response.clone()),
          metadata.put(request, Response.json(nextLifetime))
        ]);
        const keys = await tiles.keys();
        await Promise.all(keys.slice(0, -MAX_MAP_TILES).map(async (key) => {
          await Promise.all([tiles.delete(key), metadata.delete(key)]);
        }));
      } else {
        await Promise.all([tiles.delete(request), metadata.delete(request)]);
      }
    } catch {
      // A full or unavailable CacheStorage must not hide a tile fetched online.
    }
    return response;
  } catch (error) {
    if (cached && lifetime && Date.now() < lifetime.staleUntil) return cached;
    throw error;
  }
}

async function prepareOfflineShell(generation) {
  if (await hasPendingLogout()) return false;
  const manifestResponse = await fetch("/offline-assets.json", { cache: "no-store" });
  if (!manifestResponse.ok) return false;

  const manifest = await manifestResponse.json();
  if (
    !/^[a-zA-Z0-9_-]+$/.test(manifest.buildId) ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0 ||
    !manifest.assets.every(
      (asset) => typeof asset === "string" && asset.startsWith("/_next/static/")
    )
  ) {
    return false;
  }

  const cacheName = `${SHELL_CACHE_PREFIX}${manifest.buildId}`;
  const cache = await caches.open(cacheName);
  if (await cache.match(SHELL_READY_URL)) return true;

  try {
    const pages = [];
    for (const route of SHELL_ROUTES) {
      const response = await fetch(route, {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "text/html" },
        redirect: "manual"
      });
      if (
        !response.ok ||
        response.redirected ||
        !response.headers.get("content-type")?.includes("text/html")
      ) {
        throw new Error("App shell is not available to this session.");
      }
      pages.push([route, response]);
    }

    await cache.addAll(manifest.assets);
    await Promise.all(pages.map(([route, response]) => cache.put(route, response)));

    if (generation !== warmGeneration || (await hasPendingLogout())) return false;
    await cache.put(SHELL_READY_URL, new Response("ready"));
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== cacheName)
        .map((name) => caches.delete(name))
    );
    return true;
  } catch {
    return false;
  } finally {
    if (generation !== warmGeneration || !(await cache.match(SHELL_READY_URL))) {
      await caches.delete(cacheName);
    }
  }
}

function warmOfflineShell() {
  if (!warmPromise) {
    warmPromise = prepareOfflineShell(warmGeneration).finally(() => {
      warmPromise = null;
    });
  }
  return warmPromise;
}

function offlineUnavailable() {
  return new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет сети · ПВЗ Органайзер</title><style>body{margin:0;background:#f8fafc;color:#172033;font:16px system-ui,-apple-system,sans-serif}main{box-sizing:border-box;max-width:440px;margin:12vh auto;padding:24px}img{width:52px;height:52px}h1{font-size:28px;line-height:1.2;margin:28px 0 12px}p{color:#526176;line-height:1.5;margin:0 0 28px}a{display:inline-block;padding:14px 20px;border-radius:12px;background:#0f766e;color:white;font-weight:700;text-decoration:none}</style></head><body><main><img alt="" src="/brand/logo.png"><h1>Нет сети</h1><p>Подключитесь к интернету и войдите в приложение. После этого оно снова будет открываться без сети.</p><a href="/points">Повторить</a></main></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

async function navigateWithOfflineFallback(request, pathname) {
  let serverResponse;
  try {
    serverResponse = await fetch(request);
    if (serverResponse.status < 500) return serverResponse;
  } catch {
    // Use the last complete shell only when the network request failed.
  }

  const cache = await readyShellCache();
  if (!cache) return serverResponse ?? offlineUnavailable();
  if (pathname === "/") return Response.redirect(new URL("/points", self.location.origin));
  return (await cache.match(pathname)) ?? serverResponse ?? offlineUnavailable();
}

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
                name !== NEXT_ASSET_CACHE_NAME &&
                name !== AUTH_CACHE_NAME &&
                name !== MAP_TILE_CACHE_NAME &&
                name !== MAP_TILE_META_CACHE_NAME &&
                !name.startsWith(SHELL_CACHE_PREFIX)
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "WARM_OFFLINE_SHELL") {
    event.waitUntil(
      warmOfflineShell()
        .catch(() => false)
        .then((ready) => event.ports[0]?.postMessage({ ready }))
    );
  }

  if (event.data?.type === "CLEAR_OFFLINE_SHELL") {
    warmGeneration += 1;
    event.waitUntil(
      clearShellCaches().then(() => event.ports[0]?.postMessage({ cleared: true }))
    );
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (isMapTile(url)) {
    event.respondWith(loadMapTile(event.request));
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    if (url.pathname === "/" || shellRoutes.has(url.pathname)) {
      event.respondWith(navigateWithOfflineFallback(event.request, url.pathname));
    } else if (url.pathname === "/login") {
      event.respondWith(fetch(event.request).catch(() => offlineUnavailable()));
    }
    return;
  }

  const isNextAsset = url.pathname.startsWith("/_next/static/");
  if (!publicAssetPaths.has(url.pathname) && !isNextAsset) {
    return;
  }

  event.respondWith(
    caches.open(isNextAsset ? NEXT_ASSET_CACHE_NAME : CACHE_NAME).then(async (cache) => {
      const cached = isNextAsset
        ? await caches.match(event.request)
        : await cache.match(event.request);
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

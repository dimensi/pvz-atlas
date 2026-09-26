import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const origin = "https://pvz.example";

type WorkerRequest = { url: string; method: string; mode: string };
type WorkerEvent = {
  request?: WorkerRequest;
  data?: { type: string };
  ports?: { postMessage: (value: unknown) => void }[];
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (task: Promise<unknown>) => void;
};

function requestUrl(request: WorkerRequest | string): string {
  return typeof request === "string" ? new URL(request, origin).href : request.url;
}

function createWorker() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const entries = new Map<string, Map<string, Response>>();
  const precached: string[] = [];
  const fetch = vi.fn<(request: WorkerRequest | string, options?: RequestInit) => Promise<Response>>(
    async () => new Response("static asset")
  );
  const cacheFor = (name: string) => ({
    async addAll(urls: string[]) {
      precached.push(...urls);
      for (const url of urls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Cannot cache ${url}`);
        await cacheFor(name).put(url, response);
      }
    },
    async match(request: WorkerRequest | string) {
      return entries.get(name)?.get(requestUrl(request))?.clone();
    },
    async put(request: WorkerRequest | string, response: Response) {
      const cache = entries.get(name) ?? new Map<string, Response>();
      cache.set(requestUrl(request), response);
      entries.set(name, cache);
    },
    async keys() {
      return [...(entries.get(name)?.keys() ?? [])].map((url) => ({
        url,
        method: "GET",
        mode: "cors"
      }));
    },
    async delete(request: WorkerRequest) {
      return entries.get(name)?.delete(request.url) ?? false;
    }
  });
  const caches = {
    async open(name: string) {
      if (!entries.has(name)) entries.set(name, new Map());
      return cacheFor(name);
    },
    async keys() {
      return [...entries.keys()];
    },
    async delete(name: string) {
      return entries.delete(name);
    },
    async match(request: WorkerRequest | string) {
      for (const cache of entries.values()) {
        const response = cache.get(requestUrl(request));
        if (response) return response.clone();
      }
      return undefined;
    }
  };

  runInNewContext(serviceWorkerSource, {
    self: {
      location: { origin },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
      addEventListener(name: string, handler: (event: WorkerEvent) => void) {
        handlers.set(name, handler);
      }
    },
    caches,
    fetch,
    URL,
    Response
  });

  async function dispatch(name: string, request?: WorkerRequest) {
    const tasks: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get(name)?.({
      request,
      respondWith(value) {
        response = value;
      },
      waitUntil(task) {
        tasks.push(task);
      }
    });
    const result = await response;
    await Promise.all(tasks);
    return result;
  }

  async function sendMessage(type: string): Promise<{ ready?: boolean; cleared?: boolean } | undefined> {
    const tasks: Promise<unknown>[] = [];
    let message: { ready?: boolean; cleared?: boolean } | undefined;
    handlers.get("message")?.({
      data: { type },
      ports: [{ postMessage(value) { message = value as typeof message; } }],
      respondWith() {},
      waitUntil(task) { tasks.push(task); }
    });
    await Promise.all(tasks);
    return message;
  }

  return { caches, dispatch, entries, fetch, precached, sendMessage };
}

function request(path: string, mode = "cors"): WorkerRequest {
  return { url: `${origin}${path}`, method: "GET", mode };
}

describe("service worker static cache", () => {
  it("precaches public icons and map pins without protected pages", async () => {
    const worker = createWorker();
    await worker.dispatch("install");

    expect(worker.precached).toContain("/map-pins/pin-avito.png");
    expect(worker.precached).toContain("/map-pins/pin-fivepost.png");
    expect(worker.precached).toContain("/icons/icon-192.png");
    expect(worker.precached).not.toContain("/points");
    expect(worker.precached).not.toContain("/sync");
    expect(worker.precached).not.toContain("/login");
  });

  it("checks the network for app pages and login, and bypasses APIs and nonstatic Next requests", async () => {
    const worker = createWorker();

    expect((await worker.dispatch("fetch", request("/points", "navigate")))?.status).toBe(200);
    expect((await worker.dispatch("fetch", request("/login", "navigate")))?.status).toBe(200);
    expect(await worker.dispatch("fetch", request("/api/sync/pull"))).toBeUndefined();
    expect(await worker.dispatch("fetch", request("/_next/image?url=%2Fbrand%2Flogo.png"))).toBeUndefined();
    expect(worker.fetch).toHaveBeenCalledTimes(2);
  });

  it("serves previously loaded Next build assets from its static cache", async () => {
    const worker = createWorker();
    const asset = request("/_next/static/chunks/app-abc123.js");

    expect((await worker.dispatch("fetch", asset))?.status).toBe(200);
    expect((await worker.dispatch("fetch", asset))?.status).toBe(200);
    expect(worker.fetch).toHaveBeenCalledTimes(1);
    expect(worker.entries.get("pvz-atlas-next-assets-v6")?.has(asset.url)).toBe(true);
  });

  it("does not cache redirected responses", async () => {
    const worker = createWorker();
    const response = new Response("login page");
    Object.defineProperty(response, "redirected", { value: true });
    worker.fetch.mockResolvedValueOnce(response);

    await worker.dispatch("fetch", request("/brand/logo.png"));

    expect(worker.entries.get("pvz-atlas-static-v6")?.size).toBe(0);
  });

  it("bounds the Next asset cache across future deployments", async () => {
    const worker = createWorker();
    for (let index = 0; index < 130; index += 1) {
      await worker.dispatch("fetch", request(`/_next/static/chunks/${index}.js`));
    }

    const assetCache = worker.entries.get("pvz-atlas-next-assets-v6");
    expect(assetCache?.size).toBe(128);
    expect(assetCache?.has(`${origin}/_next/static/chunks/0.js`)).toBe(false);
    expect(assetCache?.has(`${origin}/_next/static/chunks/129.js`)).toBe(true);
  });

  it("removes only old PVZ caches, including the previous page cache", async () => {
    const worker = createWorker();
    await worker.caches.open("pvz-atlas-v5");
    await worker.caches.open("pvz-atlas-static-v6");
    await worker.caches.open("pvz-atlas-next-assets-v6");
    await worker.caches.open("pvz-atlas-shell-old-build");
    await worker.caches.open("pvz-atlas-auth-state");
    await worker.caches.open("pvz-atlas-map-tiles-v1");
    await worker.caches.open("pvz-atlas-map-tiles-meta-v1");
    await worker.caches.open("another-app-cache");

    await worker.dispatch("activate");

    expect([...worker.entries.keys()]).toEqual([
      "pvz-atlas-static-v6",
      "pvz-atlas-next-assets-v6",
      "pvz-atlas-shell-old-build",
      "pvz-atlas-auth-state",
      "pvz-atlas-map-tiles-v1",
      "pvz-atlas-map-tiles-meta-v1",
      "another-app-cache"
    ]);
  });
});

describe("OpenStreetMap tile cache", () => {
  const tile: WorkerRequest = {
    url: "https://tile.openstreetmap.org/15/19816/10276.png",
    method: "GET",
    mode: "no-cors"
  };

  it("caches a viewed tile and reuses it without network", async () => {
    const worker = createWorker();
    worker.fetch.mockResolvedValueOnce(new Response("tile image", {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "max-age=3600, stale-if-error=604800"
      }
    }));

    await expect((await worker.dispatch("fetch", tile))?.text()).resolves.toBe("tile image");
    expect(worker.entries.get("pvz-atlas-map-tiles-v1")?.has(tile.url)).toBe(true);
    expect(worker.fetch).toHaveBeenCalledWith(tile.url, expect.objectContaining({
      mode: "cors",
      referrer: `${origin}/`
    }));
    worker.fetch.mockRejectedValue(new Error("offline"));
    await expect((await worker.dispatch("fetch", tile))?.text()).resolves.toBe("tile image");
    expect(worker.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not intercept other external URLs or cache rejected tile responses", async () => {
    const worker = createWorker();
    expect(await worker.dispatch("fetch", { ...tile, url: "https://example.com/15/1/1.png" })).toBeUndefined();
    worker.fetch.mockResolvedValueOnce(new Response("blocked", { status: 403 }));
    expect((await worker.dispatch("fetch", tile))?.status).toBe(403);
    expect(worker.entries.get("pvz-atlas-map-tiles-v1")?.size).toBe(0);
  });

  it("loads tiles from the network when CacheStorage cannot be read", async () => {
    const worker = createWorker();
    vi.spyOn(worker.caches, "open").mockRejectedValueOnce(new Error("storage unavailable"));
    worker.fetch.mockResolvedValueOnce(new Response("network tile", {
      headers: { "Content-Type": "image/png" }
    }));

    await expect((await worker.dispatch("fetch", tile))?.text()).resolves.toBe("network tile");
    expect(worker.fetch).toHaveBeenCalledOnce();
  });

  it("uses a still valid stale tile when the tile server returns an error", async () => {
    const worker = createWorker();
    await (await worker.caches.open("pvz-atlas-map-tiles-v1")).put(tile, new Response("cached tile"));
    await (await worker.caches.open("pvz-atlas-map-tiles-meta-v1")).put(tile, Response.json({
      freshUntil: Date.now() - 1000,
      staleUntil: Date.now() + 1000
    }));
    worker.fetch.mockResolvedValueOnce(new Response("failure", { status: 503 }));

    await expect((await worker.dispatch("fetch", tile))?.text()).resolves.toBe("cached tile");
  });

  it("clears map tiles on logout", async () => {
    const worker = createWorker();
    await (await worker.caches.open("pvz-atlas-map-tiles-v1")).put(tile, new Response("tile"));
    await (await worker.caches.open("pvz-atlas-map-tiles-meta-v1")).put(tile, Response.json({ freshUntil: Date.now() + 1000 }));

    expect(await worker.sendMessage("CLEAR_OFFLINE_SHELL")).toEqual({ cleared: true });
    expect(worker.entries.has("pvz-atlas-map-tiles-v1")).toBe(false);
    expect(worker.entries.has("pvz-atlas-map-tiles-meta-v1")).toBe(false);
  });
});

describe("offline app shell", () => {
  const routes = ["/points", "/map", "/add", "/owners", "/sync"];
  const asset = "/_next/static/chunks/app-abc123.js";

  function authenticatedWorker() {
    const worker = createWorker();
    let buildId = "build-one";
    let failAsset = false;
    worker.fetch.mockImplementation(async (request) => {
      const pathname = new URL(requestUrl(request)).pathname;
      if (pathname === "/offline-assets.json") {
        return Response.json({ buildId, assets: [asset] });
      }
      if (routes.includes(pathname)) {
        return new Response(`<main>${pathname}</main>`, {
          headers: { "Content-Type": "text/html" }
        });
      }
      if (pathname === asset && failAsset) return new Response("missing", { status: 404 });
      return new Response("static asset");
    });
    return {
      ...worker,
      setBuildId(value: string) { buildId = value; },
      failNextAsset() { failAsset = true; }
    };
  }

  it("warms all pages and build assets after authentication, then opens offline", async () => {
    const worker = authenticatedWorker();
    expect(await worker.sendMessage("WARM_OFFLINE_SHELL")).toEqual({ ready: true });

    const shell = worker.entries.get("pvz-atlas-shell-build-one");
    expect(shell?.has(`${origin}/__pvz_shell_ready__`)).toBe(true);
    expect(shell?.has(`${origin}/map`)).toBe(true);
    expect(shell?.has(`${origin}${asset}`)).toBe(true);

    worker.fetch.mockRejectedValue(new Error("offline"));
    await expect((await worker.dispatch("fetch", request("/points", "navigate")))?.text()).resolves.toContain("/points");
    await expect((await worker.dispatch("fetch", request("/map", "navigate")))?.text()).resolves.toContain("/map");
    expect((await worker.dispatch("fetch", request(asset)))?.status).toBe(200);
  });

  it("does not cache a login redirect as the offline shell", async () => {
    const worker = authenticatedWorker();
    worker.fetch.mockImplementation(async (request) => {
      const pathname = new URL(requestUrl(request)).pathname;
      if (pathname === "/offline-assets.json") {
        return Response.json({ buildId: "build-one", assets: [asset] });
      }
      return Response.redirect(`${origin}/login`, 307);
    });

    expect(await worker.sendMessage("WARM_OFFLINE_SHELL")).toEqual({ ready: false });
    expect(worker.entries.has("pvz-atlas-shell-build-one")).toBe(false);
  });

  it("keeps the previous complete build when refreshing the shell fails", async () => {
    const worker = authenticatedWorker();
    expect(await worker.sendMessage("WARM_OFFLINE_SHELL")).toEqual({ ready: true });
    worker.setBuildId("build-two");
    worker.failNextAsset();

    expect(await worker.sendMessage("WARM_OFFLINE_SHELL")).toEqual({ ready: false });
    expect(worker.entries.has("pvz-atlas-shell-build-one")).toBe(true);
    expect(worker.entries.has("pvz-atlas-shell-build-two")).toBe(false);
  });

  it("removes the offline shell after logout", async () => {
    const worker = authenticatedWorker();
    expect(await worker.sendMessage("WARM_OFFLINE_SHELL")).toEqual({ ready: true });

    expect(await worker.sendMessage("CLEAR_OFFLINE_SHELL")).toEqual({ cleared: true });
    expect(worker.entries.has("pvz-atlas-shell-build-one")).toBe(false);
    worker.fetch.mockRejectedValue(new Error("offline"));
    expect((await worker.dispatch("fetch", request("/points", "navigate")))?.status).toBe(503);
  });

  it("blocks a retained shell while logout is pending and recovers login offline", async () => {
    const worker = authenticatedWorker();
    expect(await worker.sendMessage("WARM_OFFLINE_SHELL")).toEqual({ ready: true });
    const authCache = await worker.caches.open("pvz-atlas-auth-state");
    await authCache.put("/__pvz_logout_pending__", new Response("pending"));
    worker.fetch.mockRejectedValue(new Error("offline"));

    expect((await worker.dispatch("fetch", request("/points", "navigate")))?.status).toBe(503);
    expect((await worker.dispatch("fetch", request("/login", "navigate")))?.status).toBe(503);
    expect(await worker.sendMessage("WARM_OFFLINE_SHELL")).toEqual({ ready: false });
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerSource = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const origin = "https://pvz.example";

type WorkerRequest = { url: string; method: string; mode: string };
type WorkerEvent = {
  request?: WorkerRequest;
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (task: Promise<unknown>) => void;
};

function createWorker() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const entries = new Map<string, Map<string, Response>>();
  const precached: string[] = [];
  const fetch = vi.fn(async () => new Response("static asset"));
  const cacheFor = (name: string) => ({
    async addAll(urls: string[]) {
      precached.push(...urls);
    },
    async match(request: WorkerRequest) {
      return entries.get(name)?.get(request.url)?.clone();
    },
    async put(request: WorkerRequest, response: Response) {
      const cache = entries.get(name) ?? new Map<string, Response>();
      cache.set(request.url, response);
      entries.set(name, cache);
    },
    async keys() {
      return [...(entries.get(name)?.keys() ?? [])].map((url) => request(url.slice(origin.length)));
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
    URL
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

  return { caches, dispatch, entries, fetch, precached };
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

  it("bypasses page navigation, API responses, and nonstatic Next requests", async () => {
    const worker = createWorker();

    expect(await worker.dispatch("fetch", request("/points", "navigate"))).toBeUndefined();
    expect(await worker.dispatch("fetch", request("/login", "navigate"))).toBeUndefined();
    expect(await worker.dispatch("fetch", request("/api/sync/pull"))).toBeUndefined();
    expect(await worker.dispatch("fetch", request("/_next/image?url=%2Fbrand%2Flogo.png"))).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
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
    await worker.caches.open("another-app-cache");

    await worker.dispatch("activate");

    expect([...worker.entries.keys()]).toEqual([
      "pvz-atlas-static-v6",
      "pvz-atlas-next-assets-v6",
      "another-app-cache"
    ]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const serviceWorkerSource = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

describe("service worker policy", () => {
  it("precaches sync diagnostics because warning states link there", () => {
    expect(serviceWorkerSource).toContain('"/sync"');
  });

  it("precaches local map pin images for offline field use", () => {
    expect(serviceWorkerSource).toContain('"/map-pins/pin-avito.png"');
    expect(serviceWorkerSource).toContain('"/map-pins/pin-cdek.png"');
    expect(serviceWorkerSource).toContain('"/map-pins/pin-fivepost.png"');
    expect(serviceWorkerSource).toContain('"/map-pins/pin-ozon.png"');
    expect(serviceWorkerSource).toContain('"/map-pins/pin-wildberries.png"');
    expect(serviceWorkerSource).toContain('"/map-pins/pin-yandex-market.png"');
  });

  it("excludes API requests before responding from cache", () => {
    const apiGuardIndex = serviceWorkerSource.indexOf('url.pathname.startsWith("/api/")');
    const respondWithIndex = serviceWorkerSource.indexOf("event.respondWith");

    expect(apiGuardIndex).toBeGreaterThan(-1);
    expect(respondWithIndex).toBeGreaterThan(-1);
    expect(apiGuardIndex).toBeLessThan(respondWithIndex);
  });
});

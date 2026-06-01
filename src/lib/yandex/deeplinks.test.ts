import { describe, expect, it } from "vitest";
import { buildYandexRouteUrl, getYandexRouteUrl } from "./deeplinks";

describe("Yandex deeplinks", () => {
  it("builds an auto route URL to a coordinate", () => {
    const url = buildYandexRouteUrl({
      lat: 55.751244,
      lon: 37.618423
    });

    expect(url).toContain("https://yandex.ru/maps/?");
    expect(url).toContain("rtext=%7E55.751244%2C37.618423");
    expect(url).toContain("rtt=auto");
    expect(new URL(url).searchParams.has("text")).toBe(false);
  });

  it("supports a coordinate-only route URL helper", () => {
    expect(getYandexRouteUrl(55.751244, 37.618423)).toBe(
      "https://yandex.ru/maps/?rtext=%7E55.751244%2C37.618423&rtt=auto"
    );
  });
});

import { describe, expect, it } from "vitest";
import { getMapMarkerClassName, getMapMarkerHtml, getMapMarkerStyle } from "./marker-style";

describe("map marker brand styles", () => {
  it("uses the Ozon image pin for Ozon aliases", () => {
    expect(getMapMarkerStyle("Ozon")).toMatchObject({
      brand: "ozon",
      glyph: "O",
      logoSrc: null,
      pinSrc: "/map-pins/pin-ozon.png"
    });
    expect(getMapMarkerStyle("ozon").className).toBe("map-marker-brand-ozon");
  });

  it("uses the Yandex Market image pin for market aliases", () => {
    expect(getMapMarkerStyle("Яндекс Маркет")).toMatchObject({
      brand: "yandex_market",
      glyph: "M",
      logoSrc: null,
      pinSrc: "/map-pins/pin-yandex-market.png"
    });
    expect(getMapMarkerStyle("yandex_market").className).toBe(
      "map-marker-brand-yandex-market"
    );
  });

  it("uses branded fallback pins for known brands without image assets", () => {
    expect(getMapMarkerStyle("WB")).toMatchObject({
      brand: "wildberries",
      glyph: "WB",
      logoSrc: null,
      pinSrc: "/map-pins/pin-wildberries.png"
    });
    expect(getMapMarkerStyle("wildberries").className).toBe(
      "map-marker-brand-wildberries"
    );
    expect(getMapMarkerStyle("СДЭК")).toMatchObject({
      brand: "cdek",
      glyph: "C",
      logoSrc: null,
      pinSrc: "/map-pins/pin-cdek.png"
    });
    expect(getMapMarkerStyle("5Post")).toMatchObject({
      brand: "fivepost",
      glyph: "5",
      logoSrc: null,
      pinSrc: "/map-pins/pin-fivepost.png"
    });
    expect(getMapMarkerStyle("fivepost")).toMatchObject({
      brand: "fivepost",
      glyph: "5",
      logoSrc: null,
      pinSrc: "/map-pins/pin-fivepost.png"
    });
  });

  it("falls back to other styling for unknown legacy brands", () => {
    expect(getMapMarkerStyle("Boxberry")).toMatchObject({
      brand: "other",
      className: "map-marker-brand-other",
      glyph: "?",
      logoSrc: null,
      pinSrc: null
    });
  });

  it("builds controlled Leaflet class names with the status accent", () => {
    expect(getMapMarkerClassName("WB", "needs_review")).toBe(
      "map-marker map-marker-brand-wildberries map-marker-with-image map-marker-status-needs-review"
    );
    expect(getMapMarkerClassName("Ozon", "active")).toBe(
      "map-marker map-marker-brand-ozon map-marker-with-image map-marker-status-active"
    );
    expect(getMapMarkerClassName("fivepost", "new")).toBe(
      "map-marker map-marker-brand-fivepost map-marker-with-image map-marker-status-new"
    );
  });

  it("builds controlled Leaflet html without interpolating unknown brand text", () => {
    expect(getMapMarkerHtml("Яндекс Маркет")).toContain(
      '<img src="/map-pins/pin-yandex-market.png"'
    );
    expect(getMapMarkerHtml("WB")).toContain(
      '<img src="/map-pins/pin-wildberries.png"'
    );
    expect(getMapMarkerHtml("WB")).not.toContain("map-marker-status-ring");
    expect(getMapMarkerHtml('"><script>alert(1)</script>')).toContain(
      '<text x="22.5" y="26" fill="#ffffff"'
    );
    expect(getMapMarkerHtml('"><script>alert(1)</script>')).not.toContain(
      "map-marker-status-dot"
    );
    expect(getMapMarkerHtml('"><script>alert(1)</script>')).not.toContain("<script>");
  });
});

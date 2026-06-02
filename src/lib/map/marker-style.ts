import { canonicalizeBrand, type BrandId } from "@/lib/brands";
import type { PointStatus } from "@/lib/data-model/types";

export type MapMarkerBrand = BrandId;

export interface MapMarkerStyle {
  brand: MapMarkerBrand;
  bodyColor: string;
  className: string;
  glyph: string;
  glyphColor: string;
  logoBox: {
    height: number;
    width: number;
    x: number;
    y: number;
  } | null;
  logoBackground: string;
  logoSrc: string | null;
  pinSrc: string | null;
}

const PIN_BODY_PATH =
  "M20.9999 53.5C20.9999 53.5 21.4999 54.5 22.4996 54.5C23.4993 54.5 23.9999 53.5 23.9999 53.5C23.9999 53.5 24.8214 51.6204 25.4999 50.5C27.5026 47.1932 31.4997 44.5 32.4998 43.5C33.5 42.5 44.4998 35 44.4998 22.5C44.4998 10 34.6499 0.499835 22.4996 0.5C10.3495 0.500165 0.500006 9.5 0.5 22.5C0.499994 35.5 11.5 42.5 12.4998 43.5C13.4997 44.5 17.4972 47.1932 19.4999 50.5C20.1785 51.6204 20.9999 53.5 20.9999 53.5Z";

const MARKER_STYLE_BY_BRAND: Record<BrandId, MapMarkerStyle> = {
  ozon: {
    brand: "ozon",
    bodyColor: "#005bff",
    className: "map-marker-brand-ozon",
    glyph: "O",
    glyphColor: "#ffffff",
    logoBox: null,
    logoBackground: "#ffffff",
    logoSrc: null,
    pinSrc: "/map-pins/pin-ozon.png"
  },
  wildberries: {
    brand: "wildberries",
    bodyColor: "#cb11ab",
    className: "map-marker-brand-wildberries",
    glyph: "WB",
    glyphColor: "#ffffff",
    logoBox: { x: 7, y: 7, width: 31, height: 31 },
    logoBackground: "#cb11ab",
    logoSrc: null,
    pinSrc: "/map-pins/pin-wildberries.png"
  },
  yandex_market: {
    brand: "yandex_market",
    bodyColor: "#ff3d10",
    className: "map-marker-brand-yandex-market",
    glyph: "M",
    glyphColor: "#ffe500",
    logoBox: { x: 7, y: 7, width: 31, height: 31 },
    logoBackground: "#ff3d10",
    logoSrc: null,
    pinSrc: "/map-pins/pin-yandex-market.png"
  },
  cdek: {
    brand: "cdek",
    bodyColor: "#1ab248",
    className: "map-marker-brand-cdek",
    glyph: "C",
    glyphColor: "#1ab248",
    logoBox: { x: 7, y: 16, width: 31, height: 9 },
    logoBackground: "#ffffff",
    logoSrc: null,
    pinSrc: "/map-pins/pin-cdek.png"
  },
  fivepost: {
    brand: "fivepost",
    bodyColor: "#565656",
    className: "map-marker-brand-fivepost",
    glyph: "5",
    glyphColor: "#ffffff",
    logoBox: { x: 7, y: 7, width: 31, height: 31 },
    logoBackground: "#565656",
    logoSrc: null,
    pinSrc: "/map-pins/pin-fivepost.png"
  },
  other: {
    brand: "other",
    bodyColor: "#475569",
    className: "map-marker-brand-other",
    glyph: "?",
    glyphColor: "#ffffff",
    logoBox: null,
    logoBackground: "#ffffff",
    logoSrc: null,
    pinSrc: null
  }
};

const STATUS_MARKER_CLASSES: Record<PointStatus, string> = {
  new: "map-marker-status-new",
  active: "map-marker-status-active",
  needs_review: "map-marker-status-needs-review",
  closed: "map-marker-status-closed"
};

export function getMapMarkerStyle(brand: string | null | undefined): MapMarkerStyle {
  const canonicalBrand = canonicalizeBrand(brand) ?? "other";

  return MARKER_STYLE_BY_BRAND[canonicalBrand];
}

export function getMapMarkerClassName(
  brand: string | null | undefined,
  status: PointStatus
): string {
  const markerStyle = getMapMarkerStyle(brand);

  return [
    "map-marker",
    markerStyle.className,
    markerStyle.pinSrc
      ? "map-marker-with-image"
      : markerStyle.logoSrc
        ? "map-marker-with-logo"
        : "map-marker-with-glyph",
    STATUS_MARKER_CLASSES[status]
  ].join(" ");
}

export function getMapMarkerHtml(brand: string | null | undefined): string {
  const markerStyle = getMapMarkerStyle(brand);
  const imageHtml = markerStyle.pinSrc ? `<img src="${markerStyle.pinSrc}" alt="" draggable="false" />` : getVectorPinHtml(markerStyle);

  return `<span class="map-marker-pin">${imageHtml}</span>`;
}

function getVectorPinHtml(markerStyle: MapMarkerStyle): string {
  const contentHtml =
    markerStyle.logoSrc && markerStyle.logoBox
      ? `<circle cx="22.5" cy="22.5" r="17.5" fill="${markerStyle.logoBackground}" /><image href="${markerStyle.logoSrc}" x="${markerStyle.logoBox.x}" y="${markerStyle.logoBox.y}" width="${markerStyle.logoBox.width}" height="${markerStyle.logoBox.height}" preserveAspectRatio="xMidYMid meet" />`
      : `<text x="22.5" y="26" fill="${markerStyle.glyphColor}" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="800" font-family="Arial, sans-serif">${markerStyle.glyph}</text>`;

  return `<svg class="map-marker-vector-pin" width="45" height="65" viewBox="0 0 45 65" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${PIN_BODY_PATH}" fill="${markerStyle.bodyColor}" stroke="#ffffff" stroke-width="3" />${contentHtml}</svg>`;
}

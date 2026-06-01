export interface ParsedPointCoordinates {
  lat: number;
  lon: number;
}

export type CoordinateParseResult =
  | { ok: true; coordinates: ParsedPointCoordinates | null }
  | { ok: false; message: string };

function parseCoordinate(value: string, kind: "lat" | "lon"): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(",", "."));
  const min = kind === "lat" ? -90 : -180;
  const max = kind === "lat" ? 90 : 180;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return Number.NaN;
  }

  return parsed;
}

export function parsePointCoordinateInputs(latText: string, lonText: string): CoordinateParseResult {
  const lat = parseCoordinate(latText, "lat");
  const lon = parseCoordinate(lonText, "lon");

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return {
      ok: false,
      message: "Координаты должны быть числами: широта от -90 до 90, долгота от -180 до 180."
    };
  }

  if ((lat === null) !== (lon === null)) {
    return {
      ok: false,
      message: "Заполните широту и долготу вместе или оставьте оба поля пустыми."
    };
  }

  if (lat === null || lon === null) {
    return { ok: true, coordinates: null };
  }

  return { ok: true, coordinates: { lat, lon } };
}

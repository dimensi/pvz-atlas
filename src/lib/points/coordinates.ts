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

function validatePair(lat: number, lon: number): CoordinateParseResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return {
      ok: false,
      message: "Координаты должны быть числами: широта от -90 до 90, долгота от -180 до 180."
    };
  }

  return { ok: true, coordinates: { lat, lon } };
}

function parsePair(value: string): ParsedPointCoordinates | null {
  const numbers = value
    .match(/-?\d+(?:[.,]\d+)?/g)
    ?.map((part) => Number(part.replace(",", ".")));

  if (!numbers || numbers.length < 2) {
    return null;
  }

  return { lat: numbers[0], lon: numbers[1] };
}

function readUrlParam(value: string, name: string): string | null {
  try {
    return new URL(value).searchParams.get(name);
  } catch {
    return null;
  }
}

export function parsePointCoordinatesText(text: string): CoordinateParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, coordinates: null };
  }

  const ll = readUrlParam(trimmed, "ll");
  if (ll) {
    const pair = parsePair(ll);
    if (pair) {
      return validatePair(pair.lon, pair.lat);
    }
  }

  const q = readUrlParam(trimmed, "q");
  if (q) {
    const pair = parsePair(q);
    if (pair) {
      return validatePair(pair.lat, pair.lon);
    }
  }

  const pair = parsePair(trimmed);
  if (!pair) {
    return {
      ok: false,
      message: "Вставьте координаты в формате 55.123, 37.123 или ссылку с координатами."
    };
  }

  return validatePair(pair.lat, pair.lon);
}

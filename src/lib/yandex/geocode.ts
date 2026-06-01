import "server-only";

import { z } from "zod";

export interface YandexGeocodeRequest {
  city: string;
  address: string;
}

export interface YandexGeocodeCoordinates {
  lat: number;
  lon: number;
}

export interface YandexGeocodeResult {
  query: string;
  coordinates: YandexGeocodeCoordinates | null;
  warnings: string[];
}

const yandexGeocodeResponseSchema = z.object({
  response: z.object({
    GeoObjectCollection: z.object({
      featureMember: z.array(
        z.object({
          GeoObject: z.object({
            Point: z.object({
              pos: z.string()
            })
          })
        })
      )
    })
  })
});

function parsePosition(position: string): YandexGeocodeCoordinates | null {
  const [lonText, latText] = position.split(/\s+/);
  const lat = Number(latText);
  const lon = Number(lonText);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

export async function geocodeYandexAddress(
  request: YandexGeocodeRequest
): Promise<YandexGeocodeResult> {
  const query = `${request.city}, ${request.address}`;
  const apiKey = process.env.YANDEX_GEOCODER_API_KEY?.trim();

  if (!apiKey) {
    return {
      query,
      coordinates: null,
      warnings: ["YANDEX_GEOCODER_API_KEY is not configured."]
    };
  }

  const url = new URL("https://geocode-maps.yandex.ru/v1/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("geocode", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("results", "1");

  const response = await fetch(url);
  if (!response.ok) {
    return {
      query,
      coordinates: null,
      warnings: [`Yandex geocoder returned ${response.status}.`]
    };
  }

  const parsed = yandexGeocodeResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    return {
      query,
      coordinates: null,
      warnings: ["Yandex geocoder returned an unexpected response shape."]
    };
  }

  const position =
    parsed.data.response.GeoObjectCollection.featureMember[0]?.GeoObject.Point.pos ?? null;
  if (!position) {
    return {
      query,
      coordinates: null,
      warnings: ["Yandex geocoder returned no result."]
    };
  }

  const coordinates = parsePosition(position);
  return {
    query,
    coordinates,
    warnings: coordinates ? [] : ["Yandex geocoder returned invalid coordinates."]
  };
}

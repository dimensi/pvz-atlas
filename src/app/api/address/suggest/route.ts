import { z, ZodError } from "zod";
import {
  addressSuggestRequestSchema,
  addressSuggestResponseSchema,
  type AddressSuggestion
} from "@/lib/api/address-types";
import { jsonError } from "@/lib/validation/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;
const DEFAULT_PER_MINUTE_LIMIT = 30;
const DEFAULT_PER_DAY_LIMIT = 500;

type CachedSuggestions = {
  expiresAt: number;
  response: z.infer<typeof addressSuggestResponseSchema>;
};

const suggestionCache = new Map<string, CachedSuggestions>();
let minuteWindow = { startsAt: Date.now(), count: 0 };
let dayWindow = { startsAt: Date.now(), count: 0 };

const dadataSuggestionSchema = z.object({
  value: z.string().min(1),
  unrestricted_value: z.string().min(1),
  data: z.object({
    city: z.string().nullable().optional(),
    city_with_type: z.string().nullable().optional(),
    settlement: z.string().nullable().optional(),
    settlement_with_type: z.string().nullable().optional(),
    street_with_type: z.string().nullable().optional(),
    house_type: z.string().nullable().optional(),
    house: z.string().nullable().optional(),
    block_type: z.string().nullable().optional(),
    block: z.string().nullable().optional(),
    structure_type: z.string().nullable().optional(),
    structure: z.string().nullable().optional(),
    flat_type: z.string().nullable().optional(),
    flat: z.string().nullable().optional(),
    stead_type: z.string().nullable().optional(),
    stead: z.string().nullable().optional(),
    geo_lat: z.string().nullable().optional(),
    geo_lon: z.string().nullable().optional(),
    qc_geo: z.union([z.string(), z.number()]).nullable().optional()
  })
});

const dadataResponseSchema = z.object({
  suggestions: z.array(dadataSuggestionSchema).default([])
});

function parseCoordinate(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGeoQuality(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCacheKey(input: { city?: string; query: string }): string {
  return [input.city ?? "", input.query].join("|").trim().toLocaleLowerCase("ru-RU");
}

function getCachedSuggestion(cacheKey: string): z.infer<typeof addressSuggestResponseSchema> | null {
  const cached = suggestionCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    suggestionCache.delete(cacheKey);
    return null;
  }

  return cached.response;
}

function setCachedSuggestion(
  cacheKey: string,
  response: z.infer<typeof addressSuggestResponseSchema>
) {
  if (suggestionCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = suggestionCache.keys().next().value as string | undefined;
    if (oldestKey) {
      suggestionCache.delete(oldestKey);
    }
  }

  suggestionCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    response
  });
}

function consumeRateLimit(): boolean {
  const now = Date.now();
  if (now - minuteWindow.startsAt >= 60_000) {
    minuteWindow = { startsAt: now, count: 0 };
  }
  if (now - dayWindow.startsAt >= 86_400_000) {
    dayWindow = { startsAt: now, count: 0 };
  }

  const minuteLimit = readPositiveIntEnv("DADATA_SUGGEST_PER_MINUTE_LIMIT", DEFAULT_PER_MINUTE_LIMIT);
  const dayLimit = readPositiveIntEnv("DADATA_SUGGEST_PER_DAY_LIMIT", DEFAULT_PER_DAY_LIMIT);
  if (minuteWindow.count >= minuteLimit || dayWindow.count >= dayLimit) {
    return false;
  }

  minuteWindow.count += 1;
  dayWindow.count += 1;
  return true;
}

function normalizeAddressSegment(segment: string): string {
  return segment.trim().toLocaleLowerCase("ru-RU");
}

function isCitySegment(
  segment: string,
  data: z.infer<typeof dadataSuggestionSchema>["data"]
): boolean {
  const normalized = normalizeAddressSegment(segment);
  const cityCandidates = [
    data.city_with_type,
    data.settlement_with_type,
    data.city,
    data.settlement
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeAddressSegment);

  return cityCandidates.some((candidate) => normalized === candidate);
}

function formatStructuredAddressPart(
  type: string | null | undefined,
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  return [type, value].filter(Boolean).join(" ");
}

function formatAddressFromStructuredParts(
  data: z.infer<typeof dadataSuggestionSchema>["data"]
): string | null {
  const parts = [
    data.settlement_with_type && !data.street_with_type ? data.settlement_with_type : null,
    data.street_with_type,
    formatStructuredAddressPart(data.house_type, data.house),
    formatStructuredAddressPart(data.block_type, data.block),
    formatStructuredAddressPart(data.structure_type, data.structure),
    formatStructuredAddressPart(data.flat_type, data.flat),
    formatStructuredAddressPart(data.stead_type, data.stead)
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
}

function formatAddress(suggestion: z.infer<typeof dadataSuggestionSchema>): string {
  const data = suggestion.data;
  const segments = suggestion.value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length > 0) {
    const addressSegments = [...segments];
    while (addressSegments.length > 1 && isCitySegment(addressSegments[0], data)) {
      addressSegments.shift();
    }

    const hasOnlyCity =
      addressSegments.length === 1 && isCitySegment(addressSegments[0], data);
    if (addressSegments.length > 0 && !hasOnlyCity) {
      return addressSegments.join(", ");
    }
  }

  return formatAddressFromStructuredParts(data) ?? suggestion.value;
}

function formatCity(data: z.infer<typeof dadataSuggestionSchema>["data"]): string | null {
  const city = data.city ?? data.settlement;
  if (city) {
    return city;
  }

  const cityWithType = data.city_with_type ?? data.settlement_with_type ?? null;
  return cityWithType?.replace(/^(г|город|п|пос|с|д)\.?\s+/i, "") ?? null;
}

function mapSuggestion(suggestion: z.infer<typeof dadataSuggestionSchema>): AddressSuggestion {
  const data = suggestion.data;
  return {
    value: suggestion.value,
    unrestrictedValue: suggestion.unrestricted_value,
    city: formatCity(data),
    address: formatAddress(suggestion),
    lat: parseCoordinate(data.geo_lat),
    lon: parseCoordinate(data.geo_lon),
    geoQuality: parseGeoQuality(data.qc_geo)
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.DADATA_API_KEY;
    if (!apiKey) {
      return jsonError(
        503,
        "dadata_not_configured",
        "DaData address suggestions are not configured."
      );
    }

    let payload: z.infer<typeof addressSuggestRequestSchema>;
    try {
      payload = addressSuggestRequestSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonError(400, "invalid_address_suggest_request", error.message);
      }
      throw error;
    }

    const cacheKey = normalizeCacheKey(payload);
    const cached = getCachedSuggestion(cacheKey);
    if (cached) {
      return Response.json(cached);
    }

    if (!consumeRateLimit()) {
      return jsonError(
        429,
        "dadata_suggest_rate_limited",
        "DaData address suggestions are temporarily rate limited."
      );
    }

    const dadataResponse = await fetch(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: payload.city ? `${payload.city} ${payload.query}` : payload.query,
          count: 7,
          locations_boost: payload.city ? [{ city: payload.city }] : undefined
        })
      }
    );

    if (!dadataResponse.ok) {
      return jsonError(
        dadataResponse.status === 403 || dadataResponse.status === 401 ? 503 : 502,
        "dadata_suggest_failed",
        "DaData address suggestions are temporarily unavailable."
      );
    }

    let parsed: z.infer<typeof dadataResponseSchema>;
    try {
      parsed = dadataResponseSchema.parse(await dadataResponse.json());
    } catch {
      return jsonError(
        502,
        "dadata_suggest_failed",
        "DaData address suggestions are temporarily unavailable."
      );
    }

    const response = addressSuggestResponseSchema.parse({
      suggestions: parsed.suggestions.map(mapSuggestion)
    });
    setCachedSuggestion(cacheKey, response);

    return Response.json(response);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
    }

    return jsonError(
      502,
      "dadata_suggest_failed",
      "DaData address suggestions are temporarily unavailable."
    );
  }
}

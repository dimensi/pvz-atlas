import { ZodError } from "zod";
import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/validation/api";
import { geocodeYandexAddress } from "@/lib/yandex/geocode";

const geocodeRequestSchema = z.object({
  city: z.string().min(1),
  address: z.string().min(1)
});

const geocodeResponseSchema = z.object({
  query: z.string(),
  coordinates: z
    .object({
      lat: z.number(),
      lon: z.number()
    })
    .nullable(),
  warnings: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, geocodeRequestSchema);
    const result = await geocodeYandexAddress(payload);

    return Response.json(geocodeResponseSchema.parse({
      query: result.query,
      coordinates: result.coordinates,
      warnings: result.warnings
    }));
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_geocode_request", error.message);
    }

    return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
  }
}

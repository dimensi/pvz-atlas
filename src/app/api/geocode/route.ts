import { z, ZodError } from "zod";
import { jsonError, parseJsonBody } from "@/lib/validation/api";

const geocodeRequestSchema = z.object({
  city: z.string().min(1),
  address: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, geocodeRequestSchema);

    return Response.json({
      query: `${payload.city}, ${payload.address}`,
      coordinates: null,
      warnings: ["Адаптер геокодирования Яндекса еще не реализован."]
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_geocode_request", error.message);
    }

    return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
  }
}

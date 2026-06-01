import { ZodError } from "zod";
import { pushRequestSchema } from "@/lib/sync/contracts";
import { jsonError, parseJsonBody } from "@/lib/validation/api";

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, pushRequestSchema);

    return Response.json({
      acceptedChangeIds: payload.changes.map((change) => change.id),
      conflicts: [],
      warnings: ["Адаптер записи в Google Sheets еще не реализован."]
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_sync_push", error.message);
    }

    return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
  }
}

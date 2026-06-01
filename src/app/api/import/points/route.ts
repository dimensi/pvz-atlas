import { z, ZodError } from "zod";
import { createPointSourceKey } from "@/lib/data-model/source-key";
import { jsonError, parseJsonBody } from "@/lib/validation/api";

const importPointSchema = z.object({
  brand: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  comment: z.string().optional()
});

const importRequestSchema = z.object({
  points: z.array(importPointSchema).min(1).max(1000),
  previewOnly: z.boolean().default(true)
});

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, importRequestSchema);
    const preview = payload.points.map((point) => ({
      ...point,
      sourceKey: createPointSourceKey(point),
      action: "preview"
    }));

    return Response.json({
      previewOnly: payload.previewOnly,
      points: preview,
      warnings: ["Пакетная запись импорта в Sheets еще не реализована."]
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_import_request", error.message);
    }

    return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
  }
}

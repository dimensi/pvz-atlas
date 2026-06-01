import { z, ZodError } from "zod";
import type { ImportApplyResponse, ImportPreviewResponse } from "@/lib/api/types";
import { buildImportPreview, parseCsvImportPoints, parseJsonImportPoints } from "@/lib/import/points";
import { getSheetsSnapshot, invalidateSheetsSnapshot } from "@/lib/sheets/cache";
import { GoogleSheetsConfigError } from "@/lib/sheets/google-client";
import { writeSheetsChanges } from "@/lib/sheets/adapter";
import { jsonError } from "@/lib/validation/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const modeSchema = z.enum(["preview", "apply"]).default("preview");

type ParsedImportBody = {
  mode: "preview" | "apply";
  rows: ReturnType<typeof parseJsonImportPoints>["rows"];
  invalid: ReturnType<typeof parseJsonImportPoints>["invalid"];
};

function modeFromValue(value: unknown): "preview" | "apply" {
  return modeSchema.parse(value ?? "preview");
}

function modeFromJsonBody(body: unknown): "preview" | "apply" {
  if (typeof body !== "object" || body === null) {
    return "preview";
  }

  const value = body as { mode?: unknown; previewOnly?: unknown };
  if (value.mode !== undefined) {
    return modeFromValue(value.mode);
  }

  return value.previewOnly === false ? "apply" : "preview";
}

function parseJsonPayload(body: unknown): ParsedImportBody {
  if (typeof body === "object" && body !== null) {
    const payload = body as { csv?: unknown; content?: unknown; format?: unknown; json?: unknown };
    const csv =
      typeof payload.csv === "string"
        ? payload.csv
        : payload.format === "csv" && typeof payload.content === "string"
          ? payload.content
          : null;

    if (csv !== null) {
      return {
        mode: modeFromJsonBody(body),
        ...parseCsvImportPoints(csv)
      };
    }

    if (typeof payload.json === "string") {
      return {
        mode: modeFromJsonBody(body),
        ...parseJsonImportPoints(JSON.parse(payload.json) as unknown)
      };
    }
  }

  return {
    mode: modeFromJsonBody(body),
    ...parseJsonImportPoints(body)
  };
}

async function parseImportBody(request: Request): Promise<ParsedImportBody> {
  const contentType = request.headers.get("content-type") ?? "";
  const url = new URL(request.url);
  const queryMode = url.searchParams.get("mode");

  if (contentType.includes("text/csv")) {
    return {
      mode: modeFromValue(queryMode),
      ...parseCsvImportPoints(await request.text())
    };
  }

  if (contentType.includes("application/json") || contentType === "") {
    const parsed = parseJsonPayload(await request.json());
    return {
      ...parsed,
      mode: queryMode ? modeFromValue(queryMode) : parsed.mode
    };
  }

  throw new Error("Unsupported import content type.");
}

export async function POST(request: Request) {
  try {
    const payload = await parseImportBody(request);
    const snapshot = await getSheetsSnapshot();
    const preview = await buildImportPreview(payload.rows, snapshot.points, {
      clock: () => new Date().toISOString(),
      idFactory: () => crypto.randomUUID()
    });
    const invalid = [...payload.invalid, ...preview.invalid];
    const warnings = [
      ...snapshot.diagnostics.map(
        (diagnostic) =>
          `${diagnostic.sheetName}${diagnostic.rowIndex ? ` row ${diagnostic.rowIndex}` : ""}: ${diagnostic.issues.join("; ")}`
      ),
      ...preview.warnings
    ];

    if (payload.mode === "apply") {
      await writeSheetsChanges(snapshot, {
        points: [...preview.new.map((item) => item.point), ...preview.update.map((item) => item.point)]
      });
      invalidateSheetsSnapshot();
    }

    const counts = {
      new: preview.new.length,
      update: preview.update.length,
      duplicate: preview.duplicate.length,
      invalid: invalid.length
    };
    const previewPayload = {
      new: preview.new,
      update: preview.update,
      duplicate: preview.duplicate,
      invalid
    };

    if (payload.mode === "apply") {
      const response: ImportApplyResponse = {
        mode: "apply",
        applied: true,
        counts,
        preview: previewPayload,
        warnings
      };

      return Response.json(response);
    }

    const response: ImportPreviewResponse = {
      mode: "preview",
      applied: false,
      counts,
      preview: previewPayload,
      warnings
    };

    return Response.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_import_request", error.message);
    }

    if (error instanceof SyntaxError) {
      return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
    }

    if (error instanceof GoogleSheetsConfigError) {
      return jsonError(503, "sheets_not_configured", error.message);
    }

    if (error instanceof Error && error.message === "Unsupported import content type.") {
      return jsonError(415, "unsupported_import_content_type", error.message);
    }

    return jsonError(
      502,
      "import_points_failed",
      error instanceof Error ? error.message : "Import failed."
    );
  }
}

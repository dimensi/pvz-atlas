import { z, ZodError } from "zod";
import { GoogleSheetsConfigError } from "@/lib/sheets/google-client";
import { getSheetsSnapshot } from "@/lib/sheets/cache";
import { getConfiguredSheetSourceId } from "@/lib/sheets/source-id";
import { pullResponseSchema } from "@/lib/sync/contracts";
import { jsonError } from "@/lib/validation/api";

export const runtime = "nodejs";

const pullQuerySchema = z.object({
  since: z.string().datetime().optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    pullQuerySchema.parse({
      since: url.searchParams.get("since") ?? undefined
    });
    const sourceId = getConfiguredSheetSourceId();
    const snapshot = await getSheetsSnapshot();
    const response = pullResponseSchema.parse({
      sourceId,
      points: snapshot.points,
      owners: snapshot.owners,
      visits: snapshot.visits,
      conflicts: snapshot.conflicts,
      serverTime: new Date().toISOString(),
      warnings: snapshot.diagnostics.map(
        (diagnostic) =>
          `${diagnostic.sheetName}${diagnostic.rowIndex ? ` row ${diagnostic.rowIndex}` : ""}: ${diagnostic.issues.join("; ")}`
      )
    });

    return Response.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_sync_pull", error.message);
    }

    if (error instanceof GoogleSheetsConfigError) {
      return jsonError(503, "sheets_not_configured", error.message);
    }

    return jsonError(502, "sheets_pull_failed", error instanceof Error ? error.message : "Pull failed.");
  }
}

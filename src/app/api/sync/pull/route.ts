import { z, ZodError } from "zod";
import { GoogleSheetsConfigError } from "@/lib/sheets/google-client";
import { getSheetsSnapshot } from "@/lib/sheets/cache";
import { pullResponseSchema } from "@/lib/sync/contracts";
import { jsonError } from "@/lib/validation/api";

export const runtime = "nodejs";

const pullQuerySchema = z.object({
  since: z.string().datetime().optional()
});

const changedSince = <T extends { updatedAt: string }>(items: T[], since?: string): T[] => {
  if (!since) {
    return items;
  }

  const sinceMs = Date.parse(since);
  return items.filter((item) => Date.parse(item.updatedAt) > sinceMs);
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = pullQuerySchema.parse({
      since: url.searchParams.get("since") ?? undefined
    });
    const snapshot = await getSheetsSnapshot();
    const response = pullResponseSchema.parse({
      points: changedSince(snapshot.points, query.since),
      owners: changedSince(snapshot.owners, query.since),
      visits: changedSince(snapshot.visits, query.since),
      conflicts: changedSince(snapshot.conflicts, query.since),
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

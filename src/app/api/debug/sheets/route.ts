import { readSheetsSnapshot } from "@/lib/sheets/adapter";
import { GoogleSheetsConfigError } from "@/lib/sheets/google-client";
import { SHEET_NAMES } from "@/lib/sheets/schema";
import { jsonError } from "@/lib/validation/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const envStatus = () => {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "";

  return {
    GOOGLE_SHEETS_SPREADSHEET_ID: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: Boolean(privateKey.trim()),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_LOOKS_PEM:
      privateKey.includes("BEGIN PRIVATE KEY") || privateKey.includes("BEGIN RSA PRIVATE KEY"),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_HAS_ESCAPED_NEWLINES: privateKey.includes("\\n")
  };
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return jsonError(404, "not_found", "Debug routes are disabled in production.");
  }

  const startedAt = Date.now();

  try {
    const snapshot = await readSheetsSnapshot();

    return Response.json({
      ok: true,
      serverTime: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      env: envStatus(),
      sheets: {
        expected: Object.values(SHEET_NAMES),
        counts: {
          points: snapshot.points.length,
          owners: snapshot.owners.length,
          visits: snapshot.visits.length,
          changesLog: snapshot.changesLog.length,
          conflicts: snapshot.conflicts.length
        },
        diagnostics: snapshot.diagnostics
      }
    });
  } catch (error) {
    if (error instanceof GoogleSheetsConfigError) {
      return Response.json(
        {
          ok: false,
          serverTime: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt,
          env: envStatus(),
          error: {
            code: "sheets_not_configured",
            message: error.message
          }
        },
        { status: 503 }
      );
    }

    return Response.json(
      {
        ok: false,
        serverTime: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        env: envStatus(),
        error: {
          code: "sheets_debug_failed",
          message: error instanceof Error ? error.message : "Unknown Sheets debug failure."
        }
      },
      { status: 502 }
    );
  }
}

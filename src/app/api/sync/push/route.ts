import { ZodError } from "zod";
import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import { invalidateSheetsSnapshot } from "@/lib/sheets/cache";
import {
  readSheetsSnapshot,
  writeSheetsChanges,
  type SheetsSnapshot,
  type SheetsWriteSet
} from "@/lib/sheets/adapter";
import {
  createGoogleSheetsValuesClient,
  GoogleSheetsConfigError
} from "@/lib/sheets/google-client";
import { getConfiguredSheetSourceId } from "@/lib/sheets/source-id";
import { applyChangesToSnapshot } from "@/lib/sync/server-apply";
import { pushRequestSchema, pushResponseSchema } from "@/lib/sync/contracts";
import { jsonError, parseJsonBody } from "@/lib/validation/api";

export const runtime = "nodejs";

const findAppliedEntity = (
  snapshot: SheetsSnapshot,
  change: Change
): Point | Owner | Visit | undefined => {
  if (change.entityName === "point") {
    return snapshot.points.find((point) => point.id === change.entityId);
  }

  if (change.entityName === "owner") {
    return snapshot.owners.find((owner) => owner.id === change.entityId);
  }

  return snapshot.visits.find((visit) => visit.id === change.entityId);
};

const buildWriteSet = (
  originalSnapshot: SheetsSnapshot,
  nextSnapshot: SheetsSnapshot,
  submittedChanges: Change[],
  changesLog: Change[],
  conflicts: SheetsWriteSet["conflicts"],
  resolvedConflicts: Conflict[] | undefined
): SheetsWriteSet => {
  const points = new Map<string, Point>();
  const owners = new Map<string, Owner>();
  const visits = new Map<string, Visit>();

  for (const change of submittedChanges) {
    const entity = findAppliedEntity(nextSnapshot, change);
    if (!entity) {
      continue;
    }

    if (change.entityName === "point") {
      points.set(entity.id, entity as Point);
    } else if (change.entityName === "owner") {
      owners.set(entity.id, entity as Owner);
    } else {
      visits.set(entity.id, entity as Visit);
    }
  }

  const conflictsToWrite =
    conflicts?.filter((conflict) => {
      const existing = originalSnapshot.conflicts.find((item) => item.id === conflict.id);
      return !existing || shouldWriteResolvedConflict(originalSnapshot.conflicts, conflict);
    }) ?? [];
  const resolvedConflictsToWrite =
    resolvedConflicts?.filter((conflict) =>
      shouldWriteResolvedConflict(originalSnapshot.conflicts, conflict)
    ) ?? [];

  return {
    points: [...points.values()],
    owners: [...owners.values()],
    visits: [...visits.values()],
    changesLog,
    conflicts: [...conflictsToWrite, ...resolvedConflictsToWrite]
  };
};

function shouldWriteResolvedConflict(existingConflicts: Conflict[], incoming: Conflict): boolean {
  if (!incoming.resolvedAt) {
    return false;
  }

  const existing = existingConflicts.find((conflict) => conflict.id === incoming.id);
  if (!existing) {
    return true;
  }

  if (!existing.resolvedAt) {
    return true;
  }

  const incomingUpdatedAt = Date.parse(incoming.updatedAt);
  const existingUpdatedAt = Date.parse(existing.updatedAt);

  return incoming.version >= existing.version && incomingUpdatedAt >= existingUpdatedAt;
}

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, pushRequestSchema);
    const sourceId = getConfiguredSheetSourceId();
    if (payload.sourceId !== sourceId) {
      return jsonError(
        409,
        "sync_source_mismatch",
        "The spreadsheet source changed. Refresh the server data before syncing."
      );
    }
    if (payload.changes.some((change) => change.sourceId !== sourceId)) {
      return jsonError(
        409,
        "sync_change_source_mismatch",
        "Some local changes belong to another spreadsheet. Refresh the server data before syncing."
      );
    }

    const sheetsClient = await createGoogleSheetsValuesClient();
    const snapshot = await readSheetsSnapshot(sheetsClient);
    const serverTime = new Date().toISOString();
    const applied = applyChangesToSnapshot(
      {
        points: snapshot.points,
        owners: snapshot.owners,
        visits: snapshot.visits,
        conflicts: snapshot.conflicts
      },
      payload.changes,
      {
        clock: () => serverTime,
        idFactory: () => crypto.randomUUID()
      }
    );
    const nextSnapshot: SheetsSnapshot = {
      ...snapshot,
      points: applied.snapshot.points,
      owners: applied.snapshot.owners,
      visits: applied.snapshot.visits,
      conflicts: applied.snapshot.conflicts
    };
    const writeSet = buildWriteSet(
      snapshot,
      nextSnapshot,
      payload.changes,
      applied.appliedChanges,
      applied.conflicts,
      payload.resolvedConflicts
    );

    await writeSheetsChanges(snapshot, writeSet, sheetsClient);
    invalidateSheetsSnapshot();

    const response = pushResponseSchema.parse({
      sourceId,
      serverTime,
      applied: applied.acceptedChangeIds,
      rejected: applied.rejected,
      conflicts: applied.conflicts,
      points: writeSet.points,
      owners: writeSet.owners,
      visits: writeSet.visits,
      warnings: [
        ...snapshot.diagnostics.map(
          (diagnostic) =>
            `${diagnostic.sheetName}${diagnostic.rowIndex ? ` row ${diagnostic.rowIndex}` : ""}: ${diagnostic.issues.join("; ")}`
        ),
        ...applied.warnings
      ]
    });

    return Response.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "invalid_sync_push", error.message);
    }

    if (error instanceof GoogleSheetsConfigError) {
      return jsonError(503, "sheets_not_configured", error.message);
    }

    if (error instanceof SyntaxError) {
      return jsonError(400, "invalid_json", "Тело запроса должно быть валидным JSON.");
    }

    return jsonError(502, "sheets_push_failed", error instanceof Error ? error.message : "Push failed.");
  }
}

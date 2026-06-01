import { ZodError } from "zod";
import type { Change, Owner, Point, Visit } from "@/lib/data-model/types";
import { getSheetsSnapshot, invalidateSheetsSnapshot } from "@/lib/sheets/cache";
import { GoogleSheetsConfigError } from "@/lib/sheets/google-client";
import { writeSheetsChanges, type SheetsSnapshot, type SheetsWriteSet } from "@/lib/sheets/adapter";
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
  appliedChanges: Change[],
  changesLog: Change[],
  conflicts: SheetsWriteSet["conflicts"]
): SheetsWriteSet => {
  const points = new Map<string, Point>();
  const owners = new Map<string, Owner>();
  const visits = new Map<string, Visit>();

  for (const change of appliedChanges) {
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

  return {
    points: [...points.values()],
    owners: [...owners.values()],
    visits: [...visits.values()],
    changesLog,
    conflicts: conflicts?.filter(
      (conflict) => !originalSnapshot.conflicts.some((existing) => existing.id === conflict.id)
    )
  };
};

const hasConflictForChange = (
  conflicts: ReturnType<typeof applyChangesToSnapshot>["conflicts"],
  change: Change
): boolean =>
  conflicts.some(
    (conflict) =>
      conflict.entityName === change.entityName &&
      conflict.entityId === change.entityId &&
      conflict.baseVersion === change.baseVersion
  );

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, pushRequestSchema);
    const snapshot = await getSheetsSnapshot();
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
      applied.appliedChanges,
      applied.appliedChanges,
      applied.conflicts
    );

    await writeSheetsChanges(snapshot, writeSet);
    invalidateSheetsSnapshot();

    const appliedIds = new Set(applied.acceptedChangeIds);
    const response = pushResponseSchema.parse({
      serverTime,
      applied: applied.acceptedChangeIds,
      rejected: payload.changes
        .filter((change) => !appliedIds.has(change.id))
        .map((change) => ({
          changeId: change.id,
          reason: hasConflictForChange(applied.conflicts, change) ? "conflict" : "not_applied"
        })),
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

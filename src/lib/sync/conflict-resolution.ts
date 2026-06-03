"use client";

import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import { db, type PvzDatabase } from "@/lib/indexeddb/db";
import { markChangeRecordsApplied, type Clock } from "./changes";

export type ConflictResolutionChoice = "local" | "remote";

type SyncableEntity = Point | Owner | Visit;

interface ResolveConflictOptions {
  database?: PvzDatabase;
  clock?: Clock;
}

const defaultClock = (): string => new Date().toISOString();

function changeKey(change: Pick<Change, "entityName" | "entityId" | "baseVersion">): string {
  return `${change.entityName}:${change.entityId}:${change.baseVersion}`;
}

function getEntityTable(database: PvzDatabase, entityName: Conflict["entityName"]) {
  if (entityName === "point") {
    return database.points;
  }

  if (entityName === "owner") {
    return database.owners;
  }

  return database.visits;
}

function isFieldConflict(conflict: Conflict): boolean {
  return conflict.field !== "__record__";
}

function removeFieldFromPatch(change: Change, field: string, now: string): Change {
  const nextPatch = { ...change.patch };
  delete nextPatch[field];
  const nextChange = {
    ...change,
    patch: nextPatch,
    updatedAt: now,
    version: change.version + 1
  };

  if (Object.keys(nextPatch).length > 0) {
    return nextChange;
  }

  return markChangeRecordsApplied([nextChange], now)[0];
}

function retryChangeFromRemoteVersion(change: Change, remoteVersion: number, now: string): Change {
  return {
    ...change,
    baseVersion: Math.max(change.baseVersion, remoteVersion),
    updatedAt: now,
    version: change.version + 1
  };
}

async function getMatchingPendingChanges(
  database: PvzDatabase,
  conflict: Conflict
): Promise<Change[]> {
  const key = changeKey(conflict);
  const changes = await database.changes
    .filter(
      (change) =>
        change.syncedAt === null &&
        change.deletedAt === null &&
        changeKey(change) === key
    )
    .toArray();

  return changes.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function acceptRemoteValue(
  database: PvzDatabase,
  conflict: Conflict,
  pendingChanges: Change[],
  now: string
): Promise<void> {
  const nextChanges = isFieldConflict(conflict)
    ? pendingChanges.map((change) => {
        const nextChange = removeFieldFromPatch(change, conflict.field, now);
        return nextChange.syncedAt
          ? nextChange
          : retryChangeFromRemoteVersion(nextChange, conflict.remoteVersion, now);
      })
    : markChangeRecordsApplied(pendingChanges, now);

  if (nextChanges.length > 0) {
    await database.changes.bulkPut(nextChanges);
  }

  if (!isFieldConflict(conflict)) {
    return;
  }

  const table = getEntityTable(database, conflict.entityName);
  const current = (await table.get(conflict.entityId)) as SyncableEntity | undefined;
  if (!current) {
    return;
  }

  await table.put({
    ...current,
    [conflict.field]: conflict.remoteValue,
    updatedAt: now,
    version: Math.max(current.version, conflict.remoteVersion)
  } as never);
}

async function acceptLocalValue(
  database: PvzDatabase,
  conflict: Conflict,
  pendingChanges: Change[],
  now: string
): Promise<void> {
  const nextChanges = pendingChanges.map((change) =>
    retryChangeFromRemoteVersion(change, conflict.remoteVersion, now)
  );

  if (nextChanges.length > 0) {
    await database.changes.bulkPut(nextChanges);
  }
}

export async function resolveConflictLocal(
  conflictId: string,
  resolution: ConflictResolutionChoice,
  options: ResolveConflictOptions = {}
): Promise<Conflict> {
  const database = options.database ?? db;
  const clock = options.clock ?? defaultClock;
  const now = clock();

  return database.transaction(
    "rw",
    [database.points, database.owners, database.visits, database.changes, database.conflicts],
    async () => {
      const conflict = await database.conflicts.get(conflictId);
      if (!conflict || conflict.deletedAt) {
        throw new Error(`conflict ${conflictId} was not found.`);
      }

      if (conflict.resolvedAt) {
        return conflict;
      }

      const pendingChanges = await getMatchingPendingChanges(database, conflict);
      if (resolution === "remote") {
        await acceptRemoteValue(database, conflict, pendingChanges, now);
      } else {
        await acceptLocalValue(database, conflict, pendingChanges, now);
      }

      const resolvedConflict: Conflict = {
        ...conflict,
        resolvedAt: now,
        resolution,
        updatedAt: now,
        version: conflict.version + 1
      };

      await database.conflicts.put(resolvedConflict);
      return resolvedConflict;
    }
  );
}

export function mergePulledConflicts(
  pulledConflicts: Conflict[] | undefined,
  localConflicts: Conflict[]
): Conflict[] {
  if (!pulledConflicts || pulledConflicts.length === 0) {
    return [];
  }

  const localById = new Map(localConflicts.map((conflict) => [conflict.id, conflict]));

  return pulledConflicts.map((pulledConflict) => {
    const localConflict = localById.get(pulledConflict.id);
    if (
      localConflict?.resolvedAt &&
      !pulledConflict.resolvedAt &&
      Date.parse(localConflict.updatedAt) >= Date.parse(pulledConflict.updatedAt)
    ) {
      return localConflict;
    }

    return pulledConflict;
  });
}

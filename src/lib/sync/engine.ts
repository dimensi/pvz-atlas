"use client";

import type { Change, Conflict } from "@/lib/data-model/types";
import { db, type PvzDatabase } from "@/lib/indexeddb/db";
import {
  pullSync as defaultPullSync,
  pushSync as defaultPushSync
} from "@/lib/api/sync-api";
import type { PullResponse, PushRequest, PushResponse } from "@/lib/api/types";
import { markChangeRecordsApplied } from "./changes";
import {
  applyConflictResolutionInTransaction,
  findEquivalentUnresolvedConflict,
  mergePulledConflicts
} from "./conflict-resolution";

export interface SyncApiClient {
  pullSync: typeof defaultPullSync;
  pushSync: typeof defaultPushSync;
}

export interface RunSyncOptions {
  database?: PvzDatabase;
  api?: SyncApiClient;
  clientId?: string;
  since?: string | null;
}

export interface RunSyncResult {
  firstPull: PullResponse;
  pushed: PushResponse | null;
  finalPull: PullResponse;
  pendingChangeCount: number;
}

export interface RefreshOnlineCacheResult {
  mode: "pull" | "sync";
  pulled: PullResponse | null;
  synced: RunSyncResult | null;
}

const defaultClientId = "local";
export const LAST_PULL_META_KEY = "lastPullServerTime";
export const LAST_PUSH_META_KEY = "lastPushServerTime";

type SyncableEntityName = Change["entityName"];

function changeKey(change: Pick<Change, "entityName" | "entityId" | "baseVersion">): string {
  return `${change.entityName}:${change.entityId}:${change.baseVersion}`;
}

function dirtyEntityIds(changes: Change[], entityName: SyncableEntityName): Set<string> {
  return new Set(
    changes
      .filter((change) => change.entityName === entityName)
      .map((change) => change.entityId)
  );
}

async function applyPullResponse(
  database: PvzDatabase,
  response: PullResponse,
  pendingLocalChanges: Change[]
): Promise<void> {
  const dirtyPoints = dirtyEntityIds(pendingLocalChanges, "point");
  const dirtyOwners = dirtyEntityIds(pendingLocalChanges, "owner");
  const dirtyVisits = dirtyEntityIds(pendingLocalChanges, "visit");

  await database.transaction(
    "rw",
    [
      database.points,
      database.owners,
      database.visits,
      database.changes,
      database.conflicts,
      database.meta
    ],
    async () => {
      const cleanPoints = response.points.filter((point) => !dirtyPoints.has(point.id));
      const cleanOwners = response.owners.filter((owner) => !dirtyOwners.has(owner.id));
      const cleanVisits = response.visits.filter((visit) => !dirtyVisits.has(visit.id));

      if (cleanPoints.length > 0) {
        await database.points.bulkPut(cleanPoints);
      }
      if (cleanOwners.length > 0) {
        await database.owners.bulkPut(cleanOwners);
      }
      if (cleanVisits.length > 0) {
        await database.visits.bulkPut(cleanVisits);
      }
      if (response.conflicts && response.conflicts.length > 0) {
        const existingConflicts = await database.conflicts
          .filter((conflict) => conflict.deletedAt === null)
          .toArray();
        const existingById = new Map(existingConflicts.map((conflict) => [conflict.id, conflict]));

        for (const pulledConflict of response.conflicts) {
          if (
            !pulledConflict.resolvedAt ||
            !pulledConflict.resolution ||
            pulledConflict.resolution === "manual"
          ) {
            continue;
          }

          const localConflict =
            existingById.get(pulledConflict.id) ??
            findEquivalentUnresolvedConflict(pulledConflict, existingConflicts);

          if (!localConflict || localConflict.resolvedAt) {
            continue;
          }

          await applyConflictResolutionInTransaction(
            database,
            localConflict,
            pulledConflict.resolution,
            pulledConflict.resolvedAt
          );
        }

        await database.conflicts.bulkPut(
          mergePulledConflicts(response.conflicts, existingConflicts)
        );
      }

      await database.meta.put({
        key: LAST_PULL_META_KEY,
        value: response.serverTime,
        updatedAt: response.serverTime
      });
    }
  );
}

async function getLastPullSince(database: PvzDatabase): Promise<string | null> {
  const entry = await database.meta.get(LAST_PULL_META_KEY);
  return typeof entry?.value === "string" ? entry.value : null;
}

async function getPendingLocalChanges(database: PvzDatabase): Promise<Change[]> {
  const changes = await database.changes
    .filter((change) => change.syncedAt === null && change.deletedAt === null)
    .toArray();

  return changes.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function getPushableLocalChanges(database: PvzDatabase): Promise<Change[]> {
  const [changes, conflicts] = await Promise.all([
    getPendingLocalChanges(database),
    database.conflicts
      .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt === null)
      .toArray()
  ]);
  const conflictedChangeKeys = new Set(conflicts.map(changeKey));

  return changes.filter((change) => !conflictedChangeKeys.has(changeKey(change)));
}

async function getResolvedLocalConflicts(database: PvzDatabase): Promise<Conflict[]> {
  const conflicts = await database.conflicts
    .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt !== null)
    .toArray();

  return conflicts.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

async function applyPushResponse(database: PvzDatabase, response: PushResponse): Promise<void> {
  await database.transaction(
    "rw",
    [
      database.points,
      database.owners,
      database.visits,
      database.conflicts,
      database.changes,
      database.meta
    ],
    async () => {
      const pendingChanges = await getPendingLocalChanges(database);
      const appliedChangeIds = new Set(response.applied);
      const remainingChanges = pendingChanges.filter((change) => !appliedChangeIds.has(change.id));
      const dirtyPoints = dirtyEntityIds(remainingChanges, "point");
      const dirtyOwners = dirtyEntityIds(remainingChanges, "owner");
      const dirtyVisits = dirtyEntityIds(remainingChanges, "visit");

      for (const conflict of response.conflicts) {
        if (conflict.entityName === "point") {
          dirtyPoints.add(conflict.entityId);
        } else if (conflict.entityName === "owner") {
          dirtyOwners.add(conflict.entityId);
        } else if (conflict.entityName === "visit") {
          dirtyVisits.add(conflict.entityId);
        }
      }

      if (response.points && response.points.length > 0) {
        const cleanPoints = response.points.filter((point) => !dirtyPoints.has(point.id));
        if (cleanPoints.length > 0) {
          await database.points.bulkPut(cleanPoints);
        }
      }
      if (response.owners && response.owners.length > 0) {
        const cleanOwners = response.owners.filter((owner) => !dirtyOwners.has(owner.id));
        if (cleanOwners.length > 0) {
          await database.owners.bulkPut(cleanOwners);
        }
      }
      if (response.visits && response.visits.length > 0) {
        const cleanVisits = response.visits.filter((visit) => !dirtyVisits.has(visit.id));
        if (cleanVisits.length > 0) {
          await database.visits.bulkPut(cleanVisits);
        }
      }
      if (response.conflicts.length > 0) {
        await database.conflicts.bulkPut(response.conflicts);
      }

      if (response.applied.length > 0) {
        const changes = await database.changes.bulkGet(response.applied);
        const existingChanges = changes.filter((change): change is Change => Boolean(change));
        await database.changes.bulkPut(
          markChangeRecordsApplied(existingChanges, response.serverTime)
        );
      }

      await database.meta.put({
        key: LAST_PUSH_META_KEY,
        value: response.serverTime,
        updatedAt: response.serverTime
      });
    }
  );
}

export async function runSync(options: RunSyncOptions = {}): Promise<RunSyncResult> {
  const database = options.database ?? db;
  const api = options.api ?? {
    pullSync: defaultPullSync,
    pushSync: defaultPushSync
  };
  const clientId = options.clientId ?? defaultClientId;
  const since = options.since === undefined ? await getLastPullSince(database) : options.since;

  const pendingBeforePull = await getPendingLocalChanges(database);
  const firstPull = await api.pullSync(since);
  await applyPullResponse(database, firstPull, pendingBeforePull);

  const [changes, resolvedConflicts] = await Promise.all([
    getPushableLocalChanges(database),
    getResolvedLocalConflicts(database)
  ]);
  const pushRequest: PushRequest =
    resolvedConflicts.length > 0
      ? { clientId, changes, resolvedConflicts }
      : { clientId, changes };
  const pushed =
    changes.length > 0 || resolvedConflicts.length > 0
      ? await api.pushSync(pushRequest)
      : null;
  if (pushed) {
    await applyPushResponse(database, pushed);
  }

  const pendingBeforeFinalPull = await getPendingLocalChanges(database);
  const finalPull = await api.pullSync(null);
  await applyPullResponse(database, finalPull, pendingBeforeFinalPull);

  return {
    firstPull,
    pushed,
    finalPull,
    pendingChangeCount: changes.length
  };
}

let refreshOnlineCachePromise: Promise<RefreshOnlineCacheResult> | null = null;

async function refreshOnlineCacheNow(
  options: RunSyncOptions = {}
): Promise<RefreshOnlineCacheResult> {
  const database = options.database ?? db;
  const api = options.api ?? {
    pullSync: defaultPullSync,
    pushSync: defaultPushSync
  };
  const [changes, resolvedConflicts] = await Promise.all([
    getPushableLocalChanges(database),
    getResolvedLocalConflicts(database)
  ]);

  if (changes.length > 0 || resolvedConflicts.length > 0) {
    return {
      mode: "sync",
      pulled: null,
      synced: await runSync(options)
    };
  }

  const since = options.since === undefined ? await getLastPullSince(database) : options.since;
  const pendingBeforePull = await getPendingLocalChanges(database);
  const pulled = await api.pullSync(since);
  await applyPullResponse(database, pulled, pendingBeforePull);

  return {
    mode: "pull",
    pulled,
    synced: null
  };
}

export async function refreshOnlineCache(
  options: RunSyncOptions = {}
): Promise<RefreshOnlineCacheResult> {
  refreshOnlineCachePromise ??= refreshOnlineCacheNow(options).finally(() => {
    refreshOnlineCachePromise = null;
  });

  return refreshOnlineCachePromise;
}

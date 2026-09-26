"use client";

import type { Change } from "@/lib/data-model/types";
import { db, type PvzDatabase } from "@/lib/indexeddb/db";
import {
  pullSync as defaultPullSync,
  pushSync as defaultPushSync
} from "@/lib/api/sync-api";
import type { PullResponse, PushRequest, PushResponse } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { markChangeRecordsApplied } from "./changes";
import {
  applyConflictResolutionInTransaction,
  findEquivalentUnresolvedConflict,
  mergePulledConflicts
} from "./conflict-resolution";
import {
  STAGED_SNAPSHOT_META_KEY,
  PREVIOUS_DATA_BACKUPS_META_KEY,
  type PreviousDataBackup,
  FIRST_OFFLINE_DRAFT_META_KEY,
  HELD_RECORDS_BACKUP_META_KEY,
  CACHE_REPLACEMENT_NOTICE_META_KEY,
  SYNC_RUN_META_KEY,
  SYNC_SOURCE_META_KEY,
  type HeldRecordBackup,
  type StagedSnapshot,
  type SyncReview
} from "./meta";

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
  reviewRequired: boolean;
}

export interface RefreshOnlineCacheResult {
  mode: "pull" | "sync" | "review";
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

function projectRemoteEntity<TEntity extends { id: string; version: number; updatedAt: string }>(
  remote: TEntity,
  changes: Change[]
): TEntity {
  return changes
    .filter((change) => change.entityId === remote.id && change.operation !== "create")
    .reduce<TEntity>((entity, change) => ({
      ...entity,
      ...change.patch,
      version: entity.version + 1,
      updatedAt: change.updatedAt
    }), remote);
}

async function readSourceId(database: PvzDatabase): Promise<string | null> {
  const entry = await database.meta.get(SYNC_SOURCE_META_KEY);
  return typeof entry?.value === "string" ? entry.value : null;
}

async function isFirstOfflineDraft(database: PvzDatabase): Promise<boolean> {
  const [sourceId, priorPull, draftMarker, points, owners, visits, changes] = await Promise.all([
    readSourceId(database),
    database.meta.get(LAST_PULL_META_KEY),
    database.meta.get(FIRST_OFFLINE_DRAFT_META_KEY),
    database.points.toArray(),
    database.owners.toArray(),
    database.visits.toArray(),
    getPendingLocalChanges(database)
  ]);
  if (sourceId !== null || priorPull || draftMarker?.value !== true || changes.length === 0) {
    return false;
  }
  const createdIds = new Set(changes
    .filter((change) => change.operation === "create")
    .map((change) => `${change.entityName}:${change.entityId}`));
  return [...points.map((point) => `point:${point.id}`),
    ...owners.map((owner) => `owner:${owner.id}`),
    ...visits.map((visit) => `visit:${visit.id}`)]
    .every((id) => createdIds.has(id)) &&
    changes.every((change) => createdIds.has(`${change.entityName}:${change.entityId}`));
}

function hasUnsafeDataWarnings(response: PullResponse): boolean {
  return response.warnings?.some((warning) => /^(points|owners|visits)\b/.test(warning)) ?? false;
}

async function stageReviewIfNeeded(
  database: PvzDatabase,
  response: PullResponse
): Promise<SyncReview | null> {
  if (hasUnsafeDataWarnings(response)) {
    throw new Error("Некоторые строки таблицы повреждены. Обновление остановлено, данные на устройстве сохранены.");
  }

  const [sourceId, localPoints, localOwners, localVisits, pending, firstOfflineDraft] = await Promise.all([
    readSourceId(database),
    database.points.filter((point) => point.deletedAt === null).toArray(),
    database.owners.filter((owner) => owner.deletedAt === null).toArray(),
    database.visits.filter((visit) => visit.deletedAt === null).toArray(),
    getPendingLocalChanges(database),
    isFirstOfflineDraft(database)
  ]);
  const remoteIds = new Set(response.points.filter((point) => point.deletedAt === null).map((point) => point.id));
  const remoteOwnerIds = new Set(response.owners.filter((owner) => owner.deletedAt === null).map((owner) => owner.id));
  const remoteVisitIds = new Set(response.visits.filter((visit) => visit.deletedAt === null).map((visit) => visit.id));
  const sourceChanged = sourceId !== null && sourceId !== response.sourceId;
  const sourceUnverified = sourceId === null && !firstOfflineDraft && (
    localPoints.length > 0 || localOwners.length > 0 || localVisits.length > 0 || pending.length > 0
  );
  const locallyCreatedIds = new Set(
    pending.filter((change) => change.operation === "create")
      .map((change) => `${change.entityName}:${change.entityId}`)
  );
  const removedPoints = localPoints.filter(
    (point) => !remoteIds.has(point.id) && (sourceChanged || sourceUnverified || !locallyCreatedIds.has(`point:${point.id}`))
  ).length;
  const removedOwners = localOwners.filter(
    (owner) => !remoteOwnerIds.has(owner.id) && (sourceChanged || sourceUnverified || !locallyCreatedIds.has(`owner:${owner.id}`))
  ).length;
  const removedVisits = localVisits.filter(
    (visit) => !remoteVisitIds.has(visit.id) && (sourceChanged || sourceUnverified || !locallyCreatedIds.has(`visit:${visit.id}`))
  ).length;

  if (!sourceChanged && !sourceUnverified && removedPoints === 0 && removedOwners === 0 && removedVisits === 0) {
    return null;
  }

  const review: SyncReview = {
    kind: sourceChanged ? "source-changed" : sourceUnverified ? "source-unverified" : "records-removed",
    beforePoints: localPoints.length,
    afterPoints: remoteIds.size,
    removedPoints,
    removedOwners,
    removedVisits,
    pendingChanges: pending.length
  };
  const staged: StagedSnapshot = { response, review };
  await database.meta.put({
    key: STAGED_SNAPSHOT_META_KEY,
    value: staged,
    updatedAt: response.serverTime
  });
  return review;
}

async function applyPullResponse(
  database: PvzDatabase,
  response: PullResponse,
  options: { replaceAll?: boolean; detectFirstDraft?: boolean } = {}
): Promise<void> {
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
      const firstOfflineDraft = options.detectFirstDraft && await isFirstOfflineDraft(database);
      const replaceAll = options.detectFirstDraft ? !firstOfflineDraft : options.replaceAll === true;
      const sourceBeforePull = await readSourceId(database);
      if (firstOfflineDraft && sourceBeforePull === null) {
        const unboundChanges = (await getPendingLocalChanges(database))
          .filter((change) => !change.sourceId);
        await database.changes.bulkPut(unboundChanges.map((change) => ({
          ...change,
          sourceId: response.sourceId
        })));
      }
      const pendingBeforeConflictCleanup = (await getPendingLocalChanges(database)).filter(
        (change) => change.sourceId === response.sourceId
      );
      const remoteCollections = {
        point: response.points,
        owner: response.owners,
        visit: response.visits
      };
      const localConflicts = await database.conflicts
        .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt === null && conflict.sourceId === response.sourceId)
        .toArray();
      for (const conflict of localConflicts) {
        const related = pendingBeforeConflictCleanup.some((change) =>
          change.sourceId === response.sourceId && changeKey(change) === changeKey(conflict)
        );
        if (!related) {
          continue;
        }
        const remote = remoteCollections[conflict.entityName].find((entity) => entity.id === conflict.entityId);
        const remoteValue = conflict.field === "__record__"
          ? remote ?? null
          : remote ? (remote as unknown as Record<string, unknown>)[conflict.field] : null;
        await applyConflictResolutionInTransaction(
          database,
          { ...conflict, sourceId: response.sourceId, localNotice: true,
            remoteValue, remoteVersion: remote?.version ?? 0 },
          "remote",
          response.serverTime
        );
      }

      const activeChanges = (await getPendingLocalChanges(database)).filter(
        (change) => change.sourceId === response.sourceId
      );
      const sourceChanged = replaceAll && sourceBeforePull !== response.sourceId;
      const locallyCreated = new Set(activeChanges
        .filter((change) => change.operation === "create")
        .map((change) => `${change.entityName}:${change.entityId}`));
      const dirtyPoints = dirtyEntityIds(activeChanges, "point");
      const dirtyOwners = dirtyEntityIds(activeChanges, "owner");
      const dirtyVisits = dirtyEntityIds(activeChanges, "visit");
      const [localPoints, localOwners, localVisits] = await Promise.all([
        database.points.toArray(),
        database.owners.toArray(),
        database.visits.toArray()
      ]);
      const pendingToHold = replaceAll
        ? (await getPendingLocalChanges(database)).filter((change) => {
          if (change.sourceId !== response.sourceId) return true;
          const remoteIds = change.entityName === "point"
            ? new Set(response.points.map((point) => point.id))
            : change.entityName === "owner"
              ? new Set(response.owners.map((owner) => owner.id))
              : new Set(response.visits.map((visit) => visit.id));
          return change.operation !== "create" && !remoteIds.has(change.entityId);
        })
        : [];
      if (pendingToHold.length > 0) {
        const existing = (await database.meta.get(HELD_RECORDS_BACKUP_META_KEY))?.value as HeldRecordBackup[] | undefined;
        const backups = new Map((existing ?? []).map((backup) =>
          [`${backup.sourceId ?? "unbound"}:${backup.entityName}:${backup.entityId}`, backup]
        ));
        for (const change of pendingToHold) {
          const record = change.entityName === "point"
            ? localPoints.find((point) => point.id === change.entityId)
            : change.entityName === "owner"
              ? localOwners.find((owner) => owner.id === change.entityId)
              : localVisits.find((visit) => visit.id === change.entityId);
          if (!record) continue;
          const key = `${change.sourceId ?? "unbound"}:${change.entityName}:${change.entityId}`;
          if (!backups.has(key)) backups.set(key, {
            sourceId: change.sourceId ?? null,
            entityName: change.entityName,
            entityId: change.entityId,
            savedAt: response.serverTime,
            record
          });
        }
        if (backups.size > 0) {
          await database.meta.put({
            key: HELD_RECORDS_BACKUP_META_KEY,
            value: [...backups.values()],
            updatedAt: response.serverTime
          });
        }
      }
      if (sourceChanged &&
        (localPoints.length > 0 || localOwners.length > 0 || localVisits.length > 0)) {
        const existing = (await database.meta.get(PREVIOUS_DATA_BACKUPS_META_KEY))?.value as PreviousDataBackup[] | undefined;
        await database.meta.put({
          key: PREVIOUS_DATA_BACKUPS_META_KEY,
          value: [...(existing ?? []), {
            savedAt: response.serverTime,
            sourceId: sourceBeforePull,
            points: localPoints,
            owners: localOwners,
            visits: localVisits
          }],
          updatedAt: response.serverTime
        });
      }
      const pointIds = new Set(response.points.map((point) => point.id));
      const ownerIds = new Set(response.owners.map((owner) => owner.id));
      const visitIds = new Set(response.visits.map((visit) => visit.id));
      const removedPointCount = localPoints.filter((point) =>
        point.deletedAt === null && !pointIds.has(point.id) &&
        (sourceChanged || !locallyCreated.has(`point:${point.id}`))
      ).length;
      const removedOwnerCount = localOwners.filter((owner) =>
        owner.deletedAt === null && !ownerIds.has(owner.id) &&
        (sourceChanged || !locallyCreated.has(`owner:${owner.id}`))
      ).length;
      const removedVisitCount = localVisits.filter((visit) =>
        visit.deletedAt === null && !visitIds.has(visit.id) &&
        (sourceChanged || !locallyCreated.has(`visit:${visit.id}`))
      ).length;
      if (replaceAll && (
        (sourceChanged && (sourceBeforePull !== null || localPoints.length > 0 || localOwners.length > 0 || localVisits.length > 0)) ||
        removedPointCount > 0 || removedOwnerCount > 0 || removedVisitCount > 0
      )) {
        await database.meta.put({
          key: CACHE_REPLACEMENT_NOTICE_META_KEY,
          value: {
            kind: sourceChanged ? "source-changed" : "records-removed",
            at: response.serverTime,
            beforePoints: localPoints.filter((point) => point.deletedAt === null).length,
            afterPoints: response.points.filter((point) => point.deletedAt === null).length,
            removedPoints: removedPointCount,
            removedOwners: removedOwnerCount,
            removedVisits: removedVisitCount
          },
          updatedAt: response.serverTime
        });
      }
      if (replaceAll && !sourceChanged) {
        const removedDirty = activeChanges.filter((change) => {
          const ids = change.entityName === "point" ? pointIds
            : change.entityName === "owner" ? ownerIds : visitIds;
          return !ids.has(change.entityId) && change.operation !== "create";
        });
        if (removedDirty.length > 0) {
          await database.changes.bulkPut(removedDirty.map((change) => ({
            ...change,
            sourceId: `held:${response.sourceId}`
          })));
        }
      }
      await Promise.all([
        database.points.bulkDelete(localPoints.filter((point) => !pointIds.has(point.id) && (sourceChanged || !locallyCreated.has(`point:${point.id}`)) && (replaceAll || !dirtyPoints.has(point.id))).map((point) => point.id)),
        database.owners.bulkDelete(localOwners.filter((owner) => !ownerIds.has(owner.id) && (sourceChanged || !locallyCreated.has(`owner:${owner.id}`)) && (replaceAll || !dirtyOwners.has(owner.id))).map((owner) => owner.id)),
        database.visits.bulkDelete(localVisits.filter((visit) => !visitIds.has(visit.id) && (sourceChanged || !locallyCreated.has(`visit:${visit.id}`)) && (replaceAll || !dirtyVisits.has(visit.id))).map((visit) => visit.id))
      ]);
      await Promise.all([
        database.points.bulkPut(response.points.map((point) => projectRemoteEntity(point, activeChanges.filter((change) => change.entityName === "point")))),
        database.owners.bulkPut(response.owners.map((owner) => projectRemoteEntity(owner, activeChanges.filter((change) => change.entityName === "owner")))),
        database.visits.bulkPut(response.visits.map((visit) => projectRemoteEntity(visit, activeChanges.filter((change) => change.entityName === "visit"))))
      ]);
      if (response.conflicts && response.conflicts.length > 0) {
        const existingConflicts = await database.conflicts
          .filter((conflict) => conflict.deletedAt === null)
          .toArray();
        const existingById = new Map(existingConflicts.map((conflict) => [conflict.id, conflict]));
        const resolvedLocalIds = new Set<string>();

        for (const pulledConflict of response.conflicts) {
          if (
            !pulledConflict.resolvedAt ||
            !pulledConflict.resolution ||
            pulledConflict.resolution === "manual"
          ) {
            continue;
          }

          const sameSourceConflict = existingById.get(pulledConflict.id);
          const localConflict =
            (sameSourceConflict?.sourceId === response.sourceId ? sameSourceConflict : undefined) ??
            findEquivalentUnresolvedConflict(
              { ...pulledConflict, sourceId: response.sourceId },
              existingConflicts
            );

          if (!localConflict || localConflict.resolvedAt) {
            continue;
          }

          await applyConflictResolutionInTransaction(
            database,
            { ...localConflict, sourceId: response.sourceId, localNotice: true },
            pulledConflict.resolution,
            pulledConflict.resolvedAt
          );
          resolvedLocalIds.add(localConflict.id);
        }

        await database.conflicts.bulkPut(mergePulledConflicts(
          response.conflicts.filter((conflict) => conflict.resolvedAt !== null)
            .map((conflict) => ({
              ...conflict,
              sourceId: response.sourceId,
              localNotice: resolvedLocalIds.has(conflict.id) ||
                existingById.get(conflict.id)?.localNotice === true
            })),
          existingConflicts
        ));
      }

      await database.meta.put({
        key: LAST_PULL_META_KEY,
        value: response.serverTime,
        updatedAt: response.serverTime
      });
      await database.meta.put({
        key: SYNC_SOURCE_META_KEY,
        value: response.sourceId,
        updatedAt: response.serverTime
      });
      await database.meta.delete(STAGED_SNAPSHOT_META_KEY);
      await database.meta.delete(FIRST_OFFLINE_DRAFT_META_KEY);
    }
  );
}

async function getPendingLocalChanges(database: PvzDatabase): Promise<Change[]> {
  const changes = await database.changes
    .filter((change) => change.syncedAt === null && change.deletedAt === null)
    .toArray();

  return changes.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function getPushableLocalChanges(database: PvzDatabase, sourceId: string): Promise<Change[]> {
  const changes = await getPendingLocalChanges(database);
  return changes.filter((change) => change.sourceId === sourceId);
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
      const consumedChangeIds = new Set([
        ...response.applied,
        ...response.rejected
          .filter((rejection) => rejection.reason === "conflict" || rejection.reason === "legacy_base_unknown")
          .map((rejection) => rejection.changeId)
      ]);
      const remainingChanges = pendingChanges.filter((change) => !consumedChangeIds.has(change.id));
      const dirtyPoints = dirtyEntityIds(remainingChanges, "point");
      const dirtyOwners = dirtyEntityIds(remainingChanges, "owner");
      const dirtyVisits = dirtyEntityIds(remainingChanges, "visit");

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
        await database.conflicts.bulkPut(response.conflicts.map((conflict) => ({
          ...conflict,
          sourceId: response.sourceId,
          localNotice: true
        })));
      }

      if (consumedChangeIds.size > 0) {
        const changes = await database.changes.bulkGet([...consumedChangeIds]);
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

async function runSyncOnce(options: RunSyncOptions = {}): Promise<RunSyncResult> {
  const database = options.database ?? db;
  const api = options.api ?? {
    pullSync: defaultPullSync,
    pushSync: defaultPushSync
  };
  const clientId = options.clientId ?? defaultClientId;
  const firstPull = await api.pullSync(null);
  if (hasUnsafeDataWarnings(firstPull)) {
    throw new Error("Некоторые строки таблицы повреждены. Обновление остановлено, данные на устройстве сохранены.");
  }
  await applyPullResponse(database, firstPull, { detectFirstDraft: true });
  const changes = await getPushableLocalChanges(database, firstPull.sourceId);
  const pushRequest: PushRequest = { clientId, sourceId: firstPull.sourceId, changes };
  let pushed: PushResponse | null = null;
  if (changes.length > 0) {
    try {
      pushed = await api.pushSync(pushRequest);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === "sync_source_mismatch" || error.code === "sync_change_source_mismatch")
      ) {
        const changedSourcePull = await api.pullSync(null);
        if (hasUnsafeDataWarnings(changedSourcePull)) {
          throw new Error("Некоторые строки таблицы повреждены. Обновление остановлено, данные на устройстве сохранены.");
        }
        await applyPullResponse(database, changedSourcePull, { replaceAll: true });
        return {
          firstPull,
          pushed: null,
          finalPull: changedSourcePull,
          pendingChangeCount: changes.length,
          reviewRequired: false
        };
      }
      throw error;
    }
  }
  if (pushed) {
    if (pushed.sourceId !== firstPull.sourceId) {
      throw new Error("Источник данных изменился во время синхронизации. Повторите обновление.");
    }
    await applyPushResponse(database, pushed);
  }

  const finalPull = pushed ? await api.pullSync(null) : firstPull;
  if (pushed) {
    if (hasUnsafeDataWarnings(finalPull)) {
      throw new Error("Некоторые строки таблицы повреждены. Обновление остановлено, данные на устройстве сохранены.");
    }
    await applyPullResponse(database, finalPull, { replaceAll: true });
  }

  return {
    firstPull,
    pushed,
    finalPull,
    pendingChangeCount: changes.length,
    reviewRequired: false
  };
}

export async function runSync(options: RunSyncOptions = {}): Promise<RunSyncResult> {
  const database = options.database ?? db;
  const startedAt = new Date().toISOString();
  await database.meta.put({
    key: SYNC_RUN_META_KEY,
    value: { state: "checking", at: startedAt },
    updatedAt: startedAt
  });
  try {
    const result = await runSyncOnce(options);
    const finishedAt = new Date().toISOString();
    await database.meta.put({
      key: SYNC_RUN_META_KEY,
      value: { state: result.reviewRequired ? "review" : "ok", at: finishedAt },
      updatedAt: finishedAt
    });
    return result;
  } catch (error) {
    const failedAt = new Date().toISOString();
    await database.meta.put({
      key: SYNC_RUN_META_KEY,
      value: { state: "error", at: failedAt },
      updatedAt: failedAt
    });
    throw error;
  }
}

export async function acceptStagedSnapshot(options: RunSyncOptions = {}): Promise<boolean> {
  const database = options.database ?? db;
  const api = options.api ?? {
    pullSync: defaultPullSync,
    pushSync: defaultPushSync
  };
  const stagedEntry = await database.meta.get(STAGED_SNAPSHOT_META_KEY);
  const staged = stagedEntry?.value as StagedSnapshot | undefined;
  if (!staged) {
    return false;
  }

  const fresh = await api.pullSync(null);
  if (hasUnsafeDataWarnings(fresh)) {
    throw new Error("Некоторые строки таблицы повреждены. Обновление остановлено.");
  }
  const currentReview = await stageReviewIfNeeded(database, fresh);
  if (currentReview && (
    currentReview.beforePoints !== staged.review.beforePoints ||
    currentReview.removedPoints !== staged.review.removedPoints ||
    currentReview.removedOwners !== staged.review.removedOwners ||
    currentReview.removedVisits !== staged.review.removedVisits ||
    currentReview.pendingChanges !== staged.review.pendingChanges
  )) {
    return false;
  }
  const activeIds = (response: PullResponse) => JSON.stringify([
    response.points,
    response.owners,
    response.visits
  ].map((entities) => entities.filter((entity) => entity.deletedAt === null)
    .map((entity) => entity.id).sort()));
  if (fresh.sourceId !== staged.response.sourceId || activeIds(fresh) !== activeIds(staged.response)) {
    if (currentReview) {
      return false;
    }
  }

  await applyPullResponse(database, fresh, {
    replaceAll: true
  });
  return true;
}

let refreshOnlineCachePromise: Promise<RefreshOnlineCacheResult> | null = null;

async function refreshOnlineCacheNow(
  options: RunSyncOptions = {}
): Promise<RefreshOnlineCacheResult> {
  const synced = await runSync(options);
  return {
    mode: synced.reviewRequired ? "review" : synced.pushed ? "sync" : "pull",
    pulled: synced.pushed ? null : synced.firstPull,
    synced: synced.pushed ? synced : null
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

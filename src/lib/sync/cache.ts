"use client";

import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import { db, type PvzDatabase } from "@/lib/indexeddb/db";
import { LAST_PULL_META_KEY } from "./engine";
import { STAGED_SNAPSHOT_META_KEY, SYNC_SOURCE_META_KEY, type StagedSnapshot, type SyncReview } from "./meta";

export interface CachedSnapshot {
  points: Point[];
  owners: Owner[];
  visits: Visit[];
  pendingChanges: Change[];
  conflicts: Conflict[];
  lastPullServerTime: string | null;
  sourceId: string | null;
  review: SyncReview | null;
  heldChangeCount: number;
}

export type OnlineCacheStatus =
  | "loading-cache"
  | "cache"
  | "refreshing"
  | "online"
  | "offline"
  | "error";

export function hasCachedSnapshotData(snapshot: CachedSnapshot): boolean {
  return (
    snapshot.points.length > 0 ||
    snapshot.owners.length > 0 ||
    snapshot.visits.length > 0 ||
    snapshot.pendingChanges.length > 0 ||
    snapshot.conflicts.length > 0
  );
}

export async function readCachedSnapshot(
  database: PvzDatabase = db
): Promise<CachedSnapshot> {
  const [points, owners, visits, allPendingChanges, conflicts, lastPullMeta, sourceMeta, stagedMeta] = await Promise.all([
    database.points.filter((point) => point.deletedAt === null).toArray(),
    database.owners.filter((owner) => owner.deletedAt === null).toArray(),
    database.visits.filter((visit) => visit.deletedAt === null).toArray(),
    database.changes
      .filter((change) => change.deletedAt === null && change.syncedAt === null)
      .toArray(),
    database.conflicts
      .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt === null)
      .toArray(),
    database.meta.get(LAST_PULL_META_KEY),
    database.meta.get(SYNC_SOURCE_META_KEY),
    database.meta.get(STAGED_SNAPSHOT_META_KEY)
  ]);

  const sourceId = typeof sourceMeta?.value === "string" ? sourceMeta.value : null;
  const staged = stagedMeta?.value as StagedSnapshot | undefined;
  const pendingChanges = allPendingChanges.filter((change) =>
    !staged && (!sourceId || change.sourceId === sourceId)
  );
  const heldChangeCount = allPendingChanges.length - pendingChanges.length;
  const activeConflicts = conflicts.filter((conflict) => pendingChanges.some((change) =>
    change.entityName === conflict.entityName &&
    change.entityId === conflict.entityId &&
    change.baseVersion === conflict.baseVersion
  ));

  return {
    points,
    owners,
    visits,
    pendingChanges,
    conflicts: activeConflicts,
    lastPullServerTime: typeof lastPullMeta?.value === "string" ? lastPullMeta.value : null,
    sourceId,
    review: staged?.review ?? null,
    heldChangeCount
  };
}

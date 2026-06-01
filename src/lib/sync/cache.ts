"use client";

import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import { db, type PvzDatabase } from "@/lib/indexeddb/db";
import { LAST_PULL_META_KEY } from "./engine";

export interface CachedSnapshot {
  points: Point[];
  owners: Owner[];
  visits: Visit[];
  pendingChanges: Change[];
  conflicts: Conflict[];
  lastPullServerTime: string | null;
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
  const [points, owners, visits, pendingChanges, conflicts, lastPullMeta] = await Promise.all([
    database.points.filter((point) => point.deletedAt === null).toArray(),
    database.owners.filter((owner) => owner.deletedAt === null).toArray(),
    database.visits.filter((visit) => visit.deletedAt === null).toArray(),
    database.changes
      .filter((change) => change.deletedAt === null && change.syncedAt === null)
      .toArray(),
    database.conflicts
      .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt === null)
      .toArray(),
    database.meta.get(LAST_PULL_META_KEY)
  ]);

  return {
    points,
    owners,
    visits,
    pendingChanges,
    conflicts,
    lastPullServerTime: typeof lastPullMeta?.value === "string" ? lastPullMeta.value : null
  };
}

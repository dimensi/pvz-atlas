"use client";

import type { Change } from "@/lib/data-model/types";
import { db, type PvzDatabase } from "@/lib/indexeddb/db";
import {
  pullSync as defaultPullSync,
  pushSync as defaultPushSync
} from "@/lib/api/sync-api";
import type { PullResponse, PushRequest, PushResponse } from "@/lib/api/types";
import { markChangeRecordsApplied } from "./changes";

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

const defaultClientId = "local";
const lastPullMetaKey = "lastPullServerTime";
const lastPushMetaKey = "lastPushServerTime";

async function applyPullResponse(database: PvzDatabase, response: PullResponse): Promise<void> {
  await database.transaction(
    "rw",
    [database.points, database.owners, database.visits, database.conflicts, database.meta],
    async () => {
      if (response.points.length > 0) {
        await database.points.bulkPut(response.points);
      }
      if (response.owners.length > 0) {
        await database.owners.bulkPut(response.owners);
      }
      if (response.visits.length > 0) {
        await database.visits.bulkPut(response.visits);
      }
      if (response.conflicts && response.conflicts.length > 0) {
        await database.conflicts.bulkPut(response.conflicts);
      }

      await database.meta.put({
        key: lastPullMetaKey,
        value: response.serverTime,
        updatedAt: response.serverTime
      });
    }
  );
}

async function getLastPullSince(database: PvzDatabase): Promise<string | null> {
  const entry = await database.meta.get(lastPullMetaKey);
  return typeof entry?.value === "string" ? entry.value : null;
}

async function getPendingLocalChanges(database: PvzDatabase): Promise<Change[]> {
  const changes = await database.changes
    .filter((change) => change.syncedAt === null && change.deletedAt === null)
    .toArray();

  return changes.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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
      if (response.points && response.points.length > 0) {
        await database.points.bulkPut(response.points);
      }
      if (response.owners && response.owners.length > 0) {
        await database.owners.bulkPut(response.owners);
      }
      if (response.visits && response.visits.length > 0) {
        await database.visits.bulkPut(response.visits);
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
        key: lastPushMetaKey,
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

  const firstPull = await api.pullSync(since);
  await applyPullResponse(database, firstPull);

  const changes = await getPendingLocalChanges(database);
  const pushRequest: PushRequest = { clientId, changes };
  const pushed = changes.length > 0 ? await api.pushSync(pushRequest) : null;
  if (pushed) {
    await applyPushResponse(database, pushed);
  }

  const finalPull = await api.pullSync(null);
  await applyPullResponse(database, finalPull);

  return {
    firstPull,
    pushed,
    finalPull,
    pendingChangeCount: changes.length
  };
}

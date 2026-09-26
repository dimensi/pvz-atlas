"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/indexeddb/db";
import { LAST_PULL_META_KEY, refreshOnlineCache } from "@/lib/sync/engine";
import {
  SEEN_SYNC_NOTICES_META_KEY,
  PREVIOUS_DATA_BACKUPS_META_KEY,
  CACHE_REPLACEMENT_NOTICE_META_KEY,
  STAGED_SNAPSHOT_META_KEY,
  SYNC_RUN_META_KEY,
  SYNC_SOURCE_META_KEY,
  type SeenSyncNotices,
  type CacheReplacementNotice,
  type StagedSnapshot,
  type SyncReview,
  type SyncRunState
} from "@/lib/sync/meta";
import { countUnreadSyncNotices, deriveSyncStatus, type SyncStatusDisplay } from "@/lib/sync/status";

interface StoredOverview {
  lastPullServerTime: string | null;
  pendingCount: number;
  heldCount: number;
  unreadNoticeCount: number;
  previousDataAvailable: boolean;
  replacementNotice: CacheReplacementNotice | null;
  queueSignature: string;
  review: SyncReview | null;
  run: SyncRunState | null;
  sourceId: string | null;
}

export interface SyncOverview extends StoredOverview {
  online: boolean;
  status: SyncStatusDisplay;
  refreshNow: () => Promise<void>;
  markNoticesRead: (through?: string) => Promise<void>;
  acknowledgeReplacement: (at: string) => Promise<void>;
}

const emptyOverview: StoredOverview = {
  lastPullServerTime: null,
  pendingCount: 0,
  heldCount: 0,
  unreadNoticeCount: 0,
  previousDataAvailable: false,
  replacementNotice: null,
  queueSignature: "",
  review: null,
  run: null,
  sourceId: null
};

const SyncOverviewContext = createContext<SyncOverview | null>(null);

async function readStoredOverview(): Promise<StoredOverview> {
  const [changes, conflicts, sourceEntry, stagedEntry, runEntry, pullEntry, seenEntry, backupEntry, replacementEntry] = await Promise.all([
    db.changes.filter((change) => change.syncedAt === null && change.deletedAt === null).toArray(),
    db.conflicts.filter((conflict) => conflict.deletedAt === null && conflict.resolution === "remote").toArray(),
    db.meta.get(SYNC_SOURCE_META_KEY),
    db.meta.get(STAGED_SNAPSHOT_META_KEY),
    db.meta.get(SYNC_RUN_META_KEY),
    db.meta.get(LAST_PULL_META_KEY),
    db.meta.get(SEEN_SYNC_NOTICES_META_KEY),
    db.meta.get(PREVIOUS_DATA_BACKUPS_META_KEY),
    db.meta.get(CACHE_REPLACEMENT_NOTICE_META_KEY)
  ]);
  const sourceId = typeof sourceEntry?.value === "string" ? sourceEntry.value : null;
  const staged = stagedEntry?.value as StagedSnapshot | undefined;
  const seen = seenEntry?.value as SeenSyncNotices | undefined;
  const active = staged ? [] : changes.filter((change) => !sourceId || change.sourceId === sourceId);
  const unreadNoticeCount = countUnreadSyncNotices(conflicts, sourceId, seen);

  return {
    lastPullServerTime: typeof pullEntry?.value === "string" ? pullEntry.value : null,
    pendingCount: active.length,
    heldCount: changes.length - active.length,
    unreadNoticeCount,
    previousDataAvailable: Boolean(backupEntry),
    replacementNotice: (replacementEntry?.value as CacheReplacementNotice | undefined) ?? null,
    queueSignature: active.map((change) => `${change.id}:${change.updatedAt}`).sort().join("|"),
    review: staged?.review ?? null,
    run: (runEntry?.value as SyncRunState | undefined) ?? null,
    sourceId
  };
}

export function SyncOverviewProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredOverview>(emptyOverview);
  const [online, setOnline] = useState(true);
  const triggeredQueueRef = useRef("");

  const refreshNow = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    try {
      await refreshOnlineCache();
    } catch {
      // The sync engine stores the failure state for the global status.
    }
  }, []);

  const markNoticesRead = useCallback(async (through?: string) => {
    const sourceId = stored.sourceId;
    if (!sourceId || !through) return;
    await db.meta.put({
      key: SEEN_SYNC_NOTICES_META_KEY,
      value: { sourceId, through } satisfies SeenSyncNotices,
      updatedAt: new Date().toISOString()
    });
  }, [stored.sourceId]);

  const acknowledgeReplacement = useCallback(async (at: string) => {
    const entry = await db.meta.get(CACHE_REPLACEMENT_NOTICE_META_KEY);
    const notice = entry?.value as CacheReplacementNotice | undefined;
    if (notice?.at === at) await db.meta.delete(CACHE_REPLACEMENT_NOTICE_META_KEY);
  }, []);

  useEffect(() => {
    const subscription = liveQuery(readStoredOverview).subscribe({
      next: setStored,
      error: () => setStored((current) => ({
        ...current,
        run: { state: "error", at: new Date().toISOString() }
      }))
    });
    const handleOnline = () => {
      setOnline(true);
      void refreshNow();
    };
    const handleOffline = () => setOnline(false);
    const handleVisible = () => {
      if (document.visibilityState === "visible") void refreshNow();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshNow();
    }, 5 * 60_000);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisible);
    const initialRefresh = window.setTimeout(() => void refreshNow(), 0);
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [refreshNow]);

  useEffect(() => {
    if (!online || stored.review || !stored.queueSignature ||
      stored.queueSignature === triggeredQueueRef.current) return;
    triggeredQueueRef.current = stored.queueSignature;
    const timeout = window.setTimeout(() => void refreshNow(), 300);
    return () => window.clearTimeout(timeout);
  }, [online, refreshNow, stored.queueSignature, stored.review]);

  const status = useMemo(() => deriveSyncStatus({
    online,
    review: stored.review,
    run: stored.run,
    lastPullServerTime: stored.lastPullServerTime,
    pendingCount: stored.pendingCount,
    heldCount: stored.heldCount,
    unreadNoticeCount: stored.unreadNoticeCount,
    replacementNotice: stored.replacementNotice
  }), [online, stored]);

  const value: SyncOverview = { ...stored, online, status, refreshNow, markNoticesRead, acknowledgeReplacement };
  return <SyncOverviewContext.Provider value={value}>{children}</SyncOverviewContext.Provider>;
}

export function useSyncOverview(): SyncOverview {
  const context = useContext(SyncOverviewContext);
  if (!context) throw new Error("SyncOverviewProvider is required.");
  return context;
}

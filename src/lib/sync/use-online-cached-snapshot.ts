"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PvzDatabase } from "@/lib/indexeddb/db";
import type { SyncApiClient } from "./engine";
import { refreshOnlineCache } from "./engine";
import {
  hasCachedSnapshotData,
  readCachedSnapshot,
  type CachedSnapshot,
  type OnlineCacheStatus
} from "./cache";

const EMPTY_SNAPSHOT: CachedSnapshot = {
  points: [],
  owners: [],
  visits: [],
  pendingChanges: [],
  conflicts: [],
  lastPullServerTime: null
};

export interface UseOnlineCachedSnapshotOptions {
  database?: PvzDatabase;
  api?: SyncApiClient;
  clientId?: string;
  since?: string | null;
  auto?: boolean;
}

export interface UseOnlineCachedSnapshotResult {
  snapshot: CachedSnapshot;
  status: OnlineCacheStatus;
  error: string | null;
  isOnline: boolean;
  isLoadingCache: boolean;
  isRefreshing: boolean;
  refreshCache: () => Promise<CachedSnapshot>;
  refreshOnline: () => Promise<CachedSnapshot>;
}

function getBrowserOnlineState(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Не удалось обновить онлайн-данные.";
}

export function useOnlineCachedSnapshot(
  options: UseOnlineCachedSnapshotOptions = {}
): UseOnlineCachedSnapshotResult {
  const { database, api, clientId, since, auto = true } = options;
  const mountedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<CachedSnapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<OnlineCacheStatus>("loading-cache");
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const setSnapshotSafely = useCallback((nextSnapshot: CachedSnapshot) => {
    if (mountedRef.current) {
      setSnapshot(nextSnapshot);
    }
  }, []);

  const refreshCache = useCallback(async (): Promise<CachedSnapshot> => {
    const nextSnapshot = await readCachedSnapshot(database);
    setSnapshotSafely(nextSnapshot);
    return nextSnapshot;
  }, [database, setSnapshotSafely]);

  const refreshOnline = useCallback(async (): Promise<CachedSnapshot> => {
    const online = getBrowserOnlineState();
    setIsOnline(online);

    if (!online) {
      if (mountedRef.current) {
        setStatus("offline");
      }
      return refreshCache();
    }

    if (mountedRef.current) {
      setError(null);
      setStatus("refreshing");
    }

    try {
      await refreshOnlineCache({ database, api, clientId, since });
      const refreshed = await refreshCache();
      if (mountedRef.current) {
        setStatus("online");
      }
      return refreshed;
    } catch (caught) {
      const cached = await refreshCache();
      if (mountedRef.current) {
        setError(errorMessage(caught));
        setStatus("error");
      }
      return cached;
    }
  }, [api, clientId, database, refreshCache, since]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const load = async () => {
      if (mountedRef.current) {
        setStatus("loading-cache");
        setError(null);
      }

      const cached = await readCachedSnapshot(database);
      if (cancelled) {
        return;
      }

      setSnapshotSafely(cached);
      const online = getBrowserOnlineState();
      setIsOnline(online);

      if (!online) {
        setStatus("offline");
        return;
      }

      if (hasCachedSnapshotData(cached)) {
        setStatus("cache");
      }

      if (auto) {
        void refreshOnline();
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      if (auto) {
        void refreshOnline();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStatus("offline");
    };

    void load();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [auto, database, refreshOnline, setSnapshotSafely]);

  return {
    snapshot,
    status,
    error,
    isOnline,
    isLoadingCache: status === "loading-cache",
    isRefreshing: status === "refreshing",
    refreshCache,
    refreshOnline
  };
}

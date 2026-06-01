"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { db } from "@/lib/indexeddb/db";
import { runSync } from "@/lib/sync/engine";

interface SyncSummary {
  pendingChanges: number;
  unresolvedConflicts: number;
}

const emptySummary: SyncSummary = {
  pendingChanges: 0,
  unresolvedConflicts: 0
};

async function readSyncSummary(): Promise<SyncSummary> {
  const [pendingChanges, unresolvedConflicts] = await Promise.all([
    db.changes
      .filter((change) => change.deletedAt === null && change.syncedAt === null)
      .count(),
    db.conflicts
      .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt === null)
      .count()
  ]);

  return { pendingChanges, unresolvedConflicts };
}

export default function SyncClient() {
  const [summary, setSummary] = useState<SyncSummary>(emptySummary);
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSummary(await readSyncSummary());
  }, []);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(refreshTimer);
  }, [refresh]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setError(null);
      setStatus(null);

      const result = await runSync();
      await refresh();

      setStatus(
        result.pushed
          ? `Отправлено: ${result.pushed.applied.length}. Конфликтов: ${result.pushed.conflicts.length}.`
          : "Данные обновлены."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Синхронизация не выполнена.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="page-stack">
      <section>
        <h2 className="page-title">Состояние данных</h2>
        <p className="lead">Список и карта обновляются автоматически при наличии сети.</p>
      </section>

      <section className="card">
        <h3>На устройстве</h3>
        <p>
          Будет отправлено: {summary.pendingChanges}. Конфликтов: {summary.unresolvedConflicts}.
        </p>
        {error ? <div className="error-banner">{error}</div> : null}
        {status ? <p>{status}</p> : null}
        <button className="button" type="button" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw size={18} aria-hidden="true" />
          {isSyncing ? "Обновляю..." : "Обновить сейчас"}
        </button>
      </section>
    </div>
  );
}

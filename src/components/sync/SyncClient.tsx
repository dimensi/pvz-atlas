"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { db } from "@/lib/indexeddb/db";
import { runSync } from "@/lib/sync/engine";

const steps = [
  "Загрузить удаленные изменения",
  "Отправить локальные патчи",
  "Загрузить объединенное состояние"
];

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
          ? `Отправлено: ${result.pushed.applied.length}, конфликтов: ${result.pushed.conflicts.length}`
          : "Удаленные изменения загружены, локальной очереди не было."
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
        <h2 className="page-title">Синхронизация</h2>
        <p className="lead">
          Синхронизация идет по схеме pull, push, pull, чтобы ручные правки в
          Google Sheets учитывались до и после отправки локальных патчей.
        </p>
      </section>

      <section className="card">
        <h3>Очередь</h3>
        <p>
          Изменений: {summary.pendingChanges}. Конфликтов: {summary.unresolvedConflicts}.
        </p>
        {error ? <div className="error-banner">{error}</div> : null}
        {status ? <p>{status}</p> : null}
        <button className="button" type="button" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw size={18} aria-hidden="true" />
          {isSyncing ? "Синхронизация..." : "Запустить синхронизацию"}
        </button>
      </section>

      <section className="section">
        <h3 className="section-title">Процесс</h3>
        {steps.map((step, index) => (
          <article className="card" key={step}>
            <h3>
              {index + 1}. {step}
            </h3>
            <p>Шаг выполняется sync engine через typed API clients.</p>
          </article>
        ))}
      </section>
    </div>
  );
}

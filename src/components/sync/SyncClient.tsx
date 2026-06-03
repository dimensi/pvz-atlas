"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, RotateCcw } from "lucide-react";
import type { Conflict } from "@/lib/data-model/types";
import { db } from "@/lib/indexeddb/db";
import { runSync } from "@/lib/sync/engine";
import { resolveSyncConflictLocal } from "@/lib/sync/local-actions";

interface SyncSummary {
  pendingChanges: number;
  unresolvedConflicts: number;
  conflicts: Conflict[];
}

const emptySummary: SyncSummary = {
  pendingChanges: 0,
  unresolvedConflicts: 0,
  conflicts: []
};

async function readSyncSummary(): Promise<SyncSummary> {
  const [pendingChanges, conflicts] = await Promise.all([
    db.changes
      .filter((change) => change.deletedAt === null && change.syncedAt === null)
      .count(),
    db.conflicts
      .filter((conflict) => conflict.deletedAt === null && conflict.resolvedAt === null)
      .toArray()
  ]);

  return {
    pendingChanges,
    unresolvedConflicts: conflicts.length,
    conflicts: conflicts.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  };
}

function entityLabel(conflict: Conflict): string {
  if (conflict.entityName === "point") {
    return "ПВЗ";
  }

  if (conflict.entityName === "owner") {
    return "Владелец";
  }

  return "Визит";
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    ownerId: "Владелец",
    status: "Статус",
    comment: "Комментарий",
    phone: "Телефон",
    telegram: "Telegram",
    lat: "Широта",
    lon: "Долгота",
    address: "Адрес",
    city: "Город",
    brand: "Бренд",
    name: "Имя",
    deletedAt: "Удаление",
    __record__: "Запись целиком"
  };

  return labels[field] ?? field;
}

function formatConflictValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "пусто";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export default function SyncClient() {
  const [summary, setSummary] = useState<SyncSummary>(emptySummary);
  const [isSyncing, setIsSyncing] = useState(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
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

  const handleResolveConflict = async (
    conflictId: string,
    resolution: "local" | "remote"
  ) => {
    try {
      setResolvingConflictId(conflictId);
      setError(null);
      setStatus(null);

      await resolveSyncConflictLocal(conflictId, resolution);
      await refresh();
      setStatus(
        resolution === "local"
          ? "Локальная правка оставлена. Нажмите обновить, чтобы отправить ее в таблицу."
          : "Версия из таблицы принята."
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось разрешить конфликт.");
    } finally {
      setResolvingConflictId(null);
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

      {summary.conflicts.length > 0 ? (
        <section className="card">
          <h3>Конфликты</h3>
          <div className="conflict-list">
            {summary.conflicts.map((conflict) => (
              <article className="conflict-card" key={conflict.id}>
                <div>
                  <p className="conflict-title">
                    {entityLabel(conflict)} · {fieldLabel(conflict.field)}
                  </p>
                  <p className="conflict-meta">Версия в таблице: {conflict.remoteVersion}</p>
                </div>
                <div className="conflict-values">
                  <div>
                    <span>На устройстве</span>
                    <strong>{formatConflictValue(conflict.localValue)}</strong>
                  </div>
                  <div>
                    <span>В таблице</span>
                    <strong>{formatConflictValue(conflict.remoteValue)}</strong>
                  </div>
                </div>
                <div className="conflict-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={resolvingConflictId === conflict.id}
                    onClick={() => void handleResolveConflict(conflict.id, "remote")}
                  >
                    <RotateCcw size={18} aria-hidden="true" />
                    Принять из таблицы
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={resolvingConflictId === conflict.id}
                    onClick={() => void handleResolveConflict(conflict.id, "local")}
                  >
                    <Check size={18} aria-hidden="true" />
                    Оставить мое
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

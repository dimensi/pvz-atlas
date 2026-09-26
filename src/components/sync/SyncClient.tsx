"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import type { Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import { getBrandLabel } from "@/lib/brands";
import { db } from "@/lib/indexeddb/db";
import { runSync } from "@/lib/sync/engine";
import { HELD_RECORDS_BACKUP_META_KEY, PREVIOUS_DATA_BACKUPS_META_KEY, STAGED_SNAPSHOT_META_KEY, SYNC_SOURCE_META_KEY, type HeldRecordBackup, type PreviousDataBackup } from "@/lib/sync/meta";
import { useSyncOverview } from "./SyncOverviewProvider";
import { syncErrorMessage } from "@/lib/sync/user-error";

interface UnappliedChangeNotice {
  id: string;
  subject: string;
  field: string;
  localValue: string;
  remoteValue: string;
  resolvedAt: string;
  message?: string;
}

interface SyncSummary {
  pendingChanges: number;
  heldChanges: number;
  unappliedChanges: UnappliedChangeNotice[];
}

const emptySummary: SyncSummary = {
  pendingChanges: 0,
  heldChanges: 0,
  unappliedChanges: []
};

const FIELD_LABELS: Record<string, string> = {
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
  deletedAt: "Запись",
  __record__: "Запись целиком"
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  active: "Работает",
  closed: "Закрыт",
  needs_review: "Нужна проверка",
  planned: "Запланирован",
  completed: "Выполнен",
  skipped: "Пропущен"
};

function formatFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? "Другое изменение";
}

function formatValue(value: unknown, field: string, ownersById: Map<string, Owner>): string {
  if (field === "deletedAt") {
    if (value === "owner_has_assigned_points") {
      return "владельцу назначены пункты выдачи";
    }
    return value ? "скрыть запись" : "запись остаётся активной";
  }

  if (field === "ownerId") {
    if (value === null || value === undefined || value === "") {
      return "Без владельца";
    }

    if (typeof value === "string") {
      return ownersById.get(value)?.name ?? "Владелец недоступен";
    }

    return "Владелец недоступен";
  }

  if (value === null || value === undefined || value === "") {
    return "пустое значение";
  }

  if (field === "status" && typeof value === "string") {
    return STATUS_LABELS[value] ?? "Другой статус";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }

  return "изменённое значение";
}

function pointLabel(point: Point | undefined): string {
  if (!point) {
    return "Пункт выдачи";
  }

  return [getBrandLabel(point.brand), point.city, point.address]
    .filter((part) => part.trim().length > 0)
    .join(" · ");
}

function subjectForConflict(
  conflict: Conflict,
  pointsById: Map<string, Point>,
  ownersById: Map<string, Owner>,
  visitsById: Map<string, Visit>
): string {
  if (conflict.entityName === "point") {
    return pointLabel(pointsById.get(conflict.entityId));
  }

  if (conflict.entityName === "owner") {
    return ownersById.get(conflict.entityId)?.name ?? "Владелец";
  }

  const visit = visitsById.get(conflict.entityId);
  return visit ? pointLabel(pointsById.get(visit.pointId)) : "Посещение пункта";
}

async function readSyncSummary(): Promise<SyncSummary> {
  const [pendingChanges, conflicts, points, owners, visits, sourceMeta, stagedMeta] = await Promise.all([
    db.changes
      .filter((change) => change.deletedAt === null && change.syncedAt === null)
      .toArray(),
    db.conflicts.filter((conflict) => conflict.deletedAt === null).toArray(),
    db.points.toArray(),
    db.owners.toArray(),
    db.visits.toArray(),
    db.meta.get(SYNC_SOURCE_META_KEY),
    db.meta.get(STAGED_SNAPSHOT_META_KEY)
  ]);
  const sourceId = typeof sourceMeta?.value === "string" ? sourceMeta.value : null;
  const activeChanges = pendingChanges.filter((change) =>
    !stagedMeta && (!sourceId || change.sourceId === sourceId)
  );

  const pointsById = new Map(points.map((point) => [point.id, point]));
  const ownersById = new Map(owners.map((owner) => [owner.id, owner]));
  const visitsById = new Map(visits.map((visit) => [visit.id, visit]));
  const unappliedChanges = conflicts
    .filter(
      (conflict) =>
        conflict.sourceId === sourceId &&
        conflict.localNotice === true &&
        conflict.resolution === "remote" && conflict.resolvedAt !== null
    )
    .sort((left, right) =>
      (right.resolvedAt ?? right.updatedAt).localeCompare(left.resolvedAt ?? left.updatedAt)
    )
    .slice(0, 8)
    .map((conflict) => ({
      id: conflict.id,
      subject: subjectForConflict(conflict, pointsById, ownersById, visitsById),
      field: formatFieldLabel(conflict.field),
      localValue: formatValue(conflict.localValue, conflict.field, ownersById),
      remoteValue: formatValue(conflict.remoteValue, conflict.field, ownersById),
      resolvedAt: conflict.resolvedAt ?? conflict.updatedAt,
      message: conflict.field === "deletedAt" &&
        conflict.remoteValue === "owner_has_assigned_points"
        ? "Не удалось скрыть владельца: ему назначены пункты выдачи."
        : undefined
    }));

  return {
    pendingChanges: activeChanges.length,
    heldChanges: pendingChanges.length - activeChanges.length,
    unappliedChanges
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Недавно";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function downloadBackup(contents: unknown, filename: string): void {
  const file = new Blob([JSON.stringify(contents, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SyncClient() {
  const overview = useSyncOverview();
  const { markNoticesRead } = overview;
  const [summary, setSummary] = useState<SyncSummary>(emptySummary);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await readSyncSummary();
    setSummary(next);
    await markNoticesRead(next.unappliedChanges[0]?.resolvedAt);
  }, [markNoticesRead]);

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
        "reviewRequired" in result && result.reviewRequired
          ? "В таблице появились изменения для проверки. Они пока не применены."
          : "Синхронизация завершена."
      );
    } catch (caught) {
      setError(syncErrorMessage(caught));
    } finally {
      setIsSyncing(false);
    }
  };

  const saveHeldChanges = async () => {
    try {
      setIsExporting(true);
      setError(null);
      const [changes, sourceMeta, stagedMeta, recordBackupMeta] = await Promise.all([
        db.changes.filter((change) => change.deletedAt === null && change.syncedAt === null).toArray(),
        db.meta.get(SYNC_SOURCE_META_KEY),
        db.meta.get(STAGED_SNAPSHOT_META_KEY),
        db.meta.get(HELD_RECORDS_BACKUP_META_KEY)
      ]);
      const sourceId = typeof sourceMeta?.value === "string" ? sourceMeta.value : null;
      const held = changes.filter((change) =>
        Boolean(stagedMeta) || (sourceId ? change.sourceId !== sourceId : false)
      );
      if (held.length === 0) return;
      const savedRecords = (recordBackupMeta?.value as HeldRecordBackup[] | undefined) ?? [];
      downloadBackup(
        { exportedAt: new Date().toISOString(), changes: held, records: savedRecords },
        `pvz-saved-edits-${new Date().toISOString().slice(0, 10)}.json`
      );
    } catch {
      setError("Не удалось сохранить копию правок. Попробуйте ещё раз.");
    } finally {
      setIsExporting(false);
    }
  };

  const savePreviousData = async () => {
    try {
      setIsExporting(true);
      setError(null);
      const entry = await db.meta.get(PREVIOUS_DATA_BACKUPS_META_KEY);
      if (!entry) return;
      const backups = entry.value as PreviousDataBackup[];
      downloadBackup(backups, `pvz-previous-data-${new Date().toISOString().slice(0, 10)}.json`);
    } catch {
      setError("Не удалось сохранить копию прежних данных. Попробуйте ещё раз.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page-stack">
      <section>
        <h2 className="page-title">Данные и связь</h2>
        <p className="lead">
          Данные доступны на устройстве. Когда есть связь, приложение сверяет их с таблицей.
        </p>
      </section>

      <section className="card sync-current-card" aria-labelledby="sync-current-heading">
        <h3 id="sync-current-heading">Состояние данных</h3>
        <strong>{overview.status.label}</strong>
        <p>
          {!overview.online
            ? "Сейчас видны данные, сохранённые на устройстве. Новые правки отправятся при подключении."
            : overview.review
              ? "Данные таблицы пока не применены. Обновите их по предупреждению выше."
              : overview.run?.state === "error"
                ? "Не удалось проверить таблицу. Данные на устройстве доступны; попробуйте ещё раз."
                : overview.run?.state === "checking"
                  ? "Сверяю данные устройства с таблицей."
                  : overview.lastPullServerTime
                    ? "Последняя проверка таблицы прошла успешно."
                    : "На этом устройстве таблица ещё не проверялась."}
        </p>
        <p className="sync-last-checked">
          {overview.lastPullServerTime
            ? `Последняя проверка: ${formatDateTime(overview.lastPullServerTime)}`
            : "Последней проверки пока нет"}
        </p>
      </section>

      <section className="card sync-status-card" aria-labelledby="sync-device-heading">
        <div className="sync-status-copy">
          <h3 id="sync-device-heading">Изменения на устройстве</h3>
          <p>
            {overview.pendingCount > 0
              ? `Ожидают отправки: ${overview.pendingCount}.`
              : overview.heldCount > 0
                ? "Новых правок к отправке нет."
                : "Правок для отправки нет."}
          </p>
        </div>
        {overview.heldCount > 0 ? (
          <div className="sync-inline-notice" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <p>{overview.heldCount} старых локальных правок сохранены на устройстве и не
                отправляются в текущую таблицу.</p>
              <button className="button secondary" type="button" onClick={() => void saveHeldChanges()} disabled={isExporting}>
                {isExporting ? "Сохраняю копию..." : "Скачать копию правок"}
              </button>
            </div>
          </div>
        ) : null}
        {overview.previousDataAvailable ? (
          <div className="sync-inline-notice" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <p>Прежние данные сохранены на устройстве отдельной копией. Текущая таблица уже загружена.</p>
              <button className="button secondary" type="button" onClick={() => void savePreviousData()} disabled={isExporting}>
                {isExporting ? "Сохраняю копию..." : "Скачать прежние данные"}
              </button>
            </div>
          </div>
        ) : null}
        {error ? <div className="error-banner">{error}</div> : null}
        {status ? (
          <p className="sync-action-status" role="status">
            {status}
          </p>
        ) : null}
        <button className="button sync-refresh-button" type="button" onClick={handleSync} disabled={isSyncing || !overview.online || overview.run?.state === "checking"}>
          <RefreshCw size={18} aria-hidden="true" />
          {isSyncing ? "Проверяю..." : "Проверить сейчас"}
        </button>
      </section>

      {summary.unappliedChanges.length > 0 ? (
        <section className="card" aria-labelledby="sync-history-heading">
          <div className="sync-history-intro">
            <h3 id="sync-history-heading">Правки, которые таблица не приняла</h3>
            <p>Сохранено значение из таблицы. Решать ничего не нужно.</p>
          </div>
          <div className="sync-history-list">
            {summary.unappliedChanges.map((change) => (
              <article className="sync-history-card" key={change.id}>
                <h4 className="sync-history-title">{change.subject}</h4>
                <p className="sync-history-message">
                  {change.message ?? <>
                    {change.field}: локальное значение «{change.localValue}» не применено. В таблице
                    оставлено «{change.remoteValue}».
                  </>}
                </p>
                <time className="sync-history-time" dateTime={change.resolvedAt}>
                  {formatDateTime(change.resolvedAt)}
                </time>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {overview.online && overview.lastPullServerTime && overview.run?.state === "ok" &&
        summary.unappliedChanges.length === 0 && overview.pendingCount === 0 && overview.heldCount === 0 ? (
        <p className="sync-clean-note">
          <CheckCircle2 size={18} aria-hidden="true" />
          Данные на устройстве и в таблице синхронизированы.
        </p>
      ) : null}
    </div>
  );
}

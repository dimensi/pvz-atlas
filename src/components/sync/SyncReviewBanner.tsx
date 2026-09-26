"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { db } from "@/lib/indexeddb/db";
import { acceptStagedSnapshot } from "@/lib/sync/engine";
import { STAGED_SNAPSHOT_META_KEY, type StagedSnapshot } from "@/lib/sync/meta";
import { useSyncOverview } from "./SyncOverviewProvider";
import { syncErrorMessage } from "@/lib/sync/user-error";

export function SyncReviewBanner() {
  const { online, refreshNow } = useSyncOverview();
  const [staged, setStaged] = useState<StagedSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subscription = liveQuery(() => db.meta.get(STAGED_SNAPSHOT_META_KEY)).subscribe({
      next: (entry) => setStaged((entry?.value as StagedSnapshot | undefined) ?? null),
      error: () => setError("Не удалось прочитать состояние обновления.")
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!staged) {
    return null;
  }

  const { review } = staged;
  const sourceChanged = review.kind === "source-changed";
  const sourceUnverified = review.kind === "source-unverified";

  async function applyUpdate() {
    setBusy(true);
    setError(null);
    try {
      const applied = await acceptStagedSnapshot();
      if (applied) {
        await refreshNow();
      } else {
        setError("Таблица снова изменилась. Проверьте новые количества и повторите обновление.");
      }
    } catch (caught) {
      setError(syncErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sync-review-banner" aria-label="Обновление данных" role="status">
      <div className="sync-review-copy">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>
            {sourceChanged ? "Подключена другая таблица" : sourceUnverified
              ? "Обновить данные из таблицы" : "В таблице удалены записи"}
          </strong>
          <p>
            На устройстве сейчас {review.beforePoints} пунктов, в таблице {review.afterPoints}.
            {review.removedPoints > 0 ? ` После обновления исчезнут ${review.removedPoints}.` : ""}
          </p>
          {review.removedOwners > 0 || review.removedVisits > 0 ? (
            <p>
              Также удалены: владельцы — {review.removedOwners}, посещения — {review.removedVisits}.
            </p>
          ) : null}
          {review.pendingChanges > 0 ? (
            <p>
              {review.pendingChanges} локальных правок сохранены на устройстве. {sourceUnverified
                ? "Их источник не подтверждён, поэтому они не будут отправлены в эту таблицу."
                : sourceChanged
                  ? "Они относятся к прежней таблице и не будут отправлены в новую."
                  : "Правки удалённых записей останутся на устройстве; остальные будут отправлены."}
            </p>
          ) : null}
          {error ? <p className="sync-review-error">{error}</p> : null}
          {!online ? <p>Обновление продолжится, когда появится связь.</p> : null}
        </div>
      </div>
      <button className="button" type="button" disabled={busy || !online} onClick={() => void applyUpdate()}>
        <RefreshCw size={18} aria-hidden="true" />
        {busy ? "Обновляю..." : online ? "Обновить данные" : "Ждём подключения"}
      </button>
    </section>
  );
}
